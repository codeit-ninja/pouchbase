import type { PluginManifest } from '@pouchbasejs/plugin-sdk';
import type { PluginCall, PluginCallContext, PluginRuntime } from './runtime';

import { CALL_TIMEOUT, EMPTY_CALL_CONTEXT, PluginCallError } from './runtime';

/**
 * The Worker of an installed plugin with server code: one per plugin, on the Cloudflare account,
 * deployed with the Script Upload API like the functions (`<instance>-plugin-<id>`). It has three
 * modules:
 *
 * - `ENTRY_MODULE`, the main module: answers `POST /__call` with the plugin secret in
 *   `SECRET_HEADER` (compared in constant time) and 404 to everything else;
 * - `GUARD_MODULE`, imported first so it runs before any plugin code: replaces `globalThis.fetch`
 *   (and `WebSocket`) with versions limited to `permissions.network`;
 * - `PLUGIN_MODULE`: the plugin's bundled `server.js`.
 *
 * The plugin gets no `env`: the Worker's only binding is the secret. A call is
 * `{ call, context }` as JSON; the answer is `{ ok: true, value }` or `{ ok: false, error }`.
 *
 * The allowlist covers `fetch` and `WebSocket`, the APIs plugin code is meant to use. It is not a
 * full sandbox (e.g. `cloudflare:sockets` is not covered): what keeps a plugin away from Pouchbase
 * is that its Worker has no bindings and Pouchbase only sends it the call's own data.
 */

export const ENTRY_MODULE = 'pouchbase.js';
export const GUARD_MODULE = 'pouchbase-guard.js';
export const PLUGIN_MODULE = 'plugin.js';

/** Request header with the plugin's secret, from Pouchbase to the Worker. */
export const SECRET_HEADER = 'x-pouchbase-plugin-secret';

/** The only path the Worker answers. */
export const CALL_PATH = '/__call';

/** Longest Worker name that still fits in a workers.dev host name label. */
const MAX_SCRIPT_NAME = 63;

/** FNV-1a, for a short stable suffix; not for security. */
function shortHash(value: string) {
	let hash = 0x811c9dc5;

	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return (hash >>> 0).toString(36).padStart(7, '0');
}

/** The plugin's Worker, prefixed with the instance so instances on one account don't clash. */
export function pluginScriptName(instance: string, pluginId: string) {
	const name = `${instance}-plugin-${pluginId}`;

	if (name.length <= MAX_SCRIPT_NAME) {
		return name;
	}

	const suffix = `-${shortHash(pluginId)}`;

	return `${name.slice(0, MAX_SCRIPT_NAME - suffix.length).replace(/-+$/, '')}${suffix}`;
}

/** `GUARD_MODULE`; the rules match `network.ts`. */
export function guardCode(network: readonly string[]) {
	return `const NETWORK = Object.freeze(${JSON.stringify(network)});
const upstreamFetch = globalThis.fetch;
const UpstreamWebSocket = globalThis.WebSocket;
// Locked on Workers; elsewhere (tests) the globals can be restored.
const locked = globalThis.navigator?.userAgent === 'Cloudflare-Workers';

function hostMatches(hostname, pattern) {
	const host = hostname.toLowerCase().replace(/\\.$/, '');
	const entry = pattern.toLowerCase();

	if (entry.startsWith('*.')) {
		const suffix = entry.slice(1);

		return host.length > suffix.length && host.endsWith(suffix);
	}

	return host === entry;
}

function blockedReason(url, protocol) {
	if (url.protocol !== protocol) {
		return 'Only ' + protocol.slice(0, -1) + ' URLs can be fetched: ' + url.href;
	}

	if (!NETWORK.some((pattern) => hostMatches(url.hostname, pattern))) {
		return url.hostname + ' is not in permissions.network';
	}

	return null;
}

export function restrictedFetch(input, init) {
	try {
		const request = new Request(input, init);
		const reason = blockedReason(new URL(request.url), 'https:');

		if (reason) {
			return Promise.reject(new TypeError(reason));
		}

		return upstreamFetch(new Request(request, { redirect: 'manual' }));
	} catch (error) {
		return Promise.reject(error);
	}
}

function replace(name, value) {
	Object.defineProperty(globalThis, name, {
		value,
		writable: !locked,
		configurable: !locked,
		enumerable: false
	});
}

replace('fetch', restrictedFetch);

if (typeof UpstreamWebSocket === 'function') {
	replace(
		'WebSocket',
		class WebSocket extends UpstreamWebSocket {
			constructor(url, protocols) {
				const reason = blockedReason(new URL(url), 'wss:');

				if (reason) {
					throw new TypeError(reason);
				}

				super(url, protocols);
			}
		}
	);
}

export function restoreGlobals() {
	if (!locked) {
		replace('fetch', upstreamFetch);

		if (typeof UpstreamWebSocket === 'function') {
			replace('WebSocket', UpstreamWebSocket);
		}
	}
}
`;
}

/** `ENTRY_MODULE`; `dispatch` matches `runtime.ts`. */
export function entryCode(manifest: Pick<PluginManifest, 'id' | 'version'>) {
	return `import { restrictedFetch } from './${GUARD_MODULE}';
import definition from './${PLUGIN_MODULE}';

const PLUGIN = Object.freeze(${JSON.stringify({ id: manifest.id, version: manifest.version })});
const encoder = new TextEncoder();

function matches(value, secret) {
	const left = encoder.encode(value ?? '');
	const right = encoder.encode(secret ?? '');

	return left.byteLength > 0 && left.byteLength === right.byteLength && crypto.subtle.timingSafeEqual(left, right);
}

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function log(level) {
	return (message, data) => console[level]('[plugin ' + PLUGIN.id + ']', message, ...(data === undefined ? [] : [data]));
}

function context(input) {
	const settings = input && typeof input.settings === 'object' && input.settings ? input.settings : {};

	return {
		plugin: { ...PLUGIN },
		fetch: restrictedFetch,
		settings: {
			get: async (key) => (Object.hasOwn(settings, key) && typeof settings[key] === 'string' ? settings[key] : null)
		},
		log: { info: log('info'), warn: log('warn'), error: log('error') }
	};
}

async function dispatch(call, ctx) {
	const plugin = definition ?? {};
	const providers = plugin.authProviders ?? {};

	switch (call?.type) {
		case 'describe':
			return {
				authProviders: Object.fromEntries(
					Object.entries(providers).map(([id, handler]) => [
						id,
						{ authorizeUrl: handler.authorizeUrl, tokenUrl: handler.tokenUrl, scopes: handler.scopes, pkce: handler.pkce }
					])
				),
				fields: Object.keys(plugin.fields ?? {}),
				routes: Object.keys(plugin.routes ?? {})
			};
		case 'profile': {
			const handler = Object.hasOwn(providers, call.provider) ? providers[call.provider] : undefined;

			if (typeof handler?.profile !== 'function') {
				throw new Error('The plugin has no auth provider ' + call.provider);
			}

			return handler.profile(String(call.accessToken ?? ''), { clientId: String(call.credentials?.clientId ?? '') }, ctx);
		}
		default:
			throw new Error('Unknown call: ' + call?.type);
	}
}

export default {
	async fetch(request, env) {
		if (!matches(request.headers.get('${SECRET_HEADER}'), env.POUCHBASE_PLUGIN_SECRET)) {
			return new Response('Not found', { status: 404 });
		}

		if (request.method !== 'POST' || new URL(request.url).pathname !== '${CALL_PATH}') {
			return new Response('Not found', { status: 404 });
		}

		let body;

		try {
			body = await request.json();
		} catch {
			return json({ ok: false, error: 'The call is not valid JSON' }, 400);
		}

		try {
			const value = await dispatch(body?.call, context(body?.context));

			return json({ ok: true, value: value ?? null });
		} catch (error) {
			return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
		}
	}
};
`;
}

/** The modules of a plugin's Worker, for `functions.deploy`. */
export function workerModules(
	manifest: Pick<PluginManifest, 'id' | 'version' | 'permissions'>,
	server: string
) {
	return [
		{ name: ENTRY_MODULE, content: entryCode(manifest) },
		{ name: GUARD_MODULE, content: guardCode(manifest.permissions.network) },
		{ name: PLUGIN_MODULE, content: server }
	];
}

/** Calls the plugin's Worker over its workers.dev URL. */
export class WorkerRuntime implements PluginRuntime {
	constructor(
		private readonly url: string,
		private readonly secret: string,
		private readonly options: { timeout?: number; fetch?: typeof fetch } = {}
	) {}

	async call(call: PluginCall, context: PluginCallContext = EMPTY_CALL_CONTEXT): Promise<unknown> {
		const timeout = this.options.timeout ?? CALL_TIMEOUT;
		let response: Response;

		try {
			response = await (this.options.fetch ?? fetch)(new URL(CALL_PATH, this.url), {
				method: 'POST',
				headers: { 'content-type': 'application/json', [SECRET_HEADER]: this.secret },
				body: JSON.stringify({ call, context }),
				redirect: 'manual',
				signal: AbortSignal.timeout(timeout)
			});
		} catch (error) {
			throw new PluginCallError(
				error instanceof Error && error.name === 'TimeoutError'
					? `No answer within ${timeout / 1000} seconds`
					: `The plugin's Worker can't be reached: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error, retryable: true }
			);
		}

		let body: unknown;

		try {
			body = await response.json();
		} catch {
			// workers.dev answers with a page of its own until a new Worker is reachable there.
			throw new PluginCallError(
				`The plugin's Worker answered ${response.status} without a result`,
				{ retryable: true }
			);
		}

		const result = body as { ok?: unknown; value?: unknown; error?: unknown } | null;

		if (result?.ok === true) {
			return result.value;
		}

		throw new PluginCallError(
			typeof result?.error === 'string'
				? result.error
				: `The plugin's Worker answered ${response.status} without a result`
		);
	}
}
