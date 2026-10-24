import type { PluginManifest } from '@pouchbasejs/plugin-sdk';
import type { OAuthProfile, PluginContext, PluginDefinition } from '@pouchbasejs/plugin-sdk/server';

import { z } from 'zod';

/**
 * How the host runs a plugin's server code. Every plugin with server code has a `PluginRuntime`:
 *
 * - an installed plugin runs in its own Worker on the Cloudflare account (`WorkerRuntime`,
 *   `worker.ts`), reached over workers.dev with a shared secret;
 * - a built-in plugin (`plugins/*` in this repository) runs inside Pouchbase
 *   (`InProcessRuntime`, `embedded.ts`).
 *
 * Both answer the same calls, through `dispatch` below (the Worker has a copy of it in its entry
 * code). The host does the OAuth redirect and the token exchange itself, from what `describe`
 * returns; only `profile` runs plugin code during a sign-in.
 */

/** A call from the host into a plugin's server code. */
export type PluginCall =
	| { type: 'describe' }
	| {
			type: 'profile';
			/** The provider id, e.g. `google`. */
			provider: string;
			accessToken: string;
			credentials: { clientId: string };
	  };

/** What the host passes along with every call. */
export type PluginCallContext = {
	/** The plugin's settings (none can be entered yet). */
	settings: Record<string, string>;
};

export const EMPTY_CALL_CONTEXT: PluginCallContext = { settings: {} };

export interface PluginRuntime {
	/** Runs a call; throws `PluginCallError` when the plugin fails or doesn't answer in time. */
	call(call: PluginCall, context?: PluginCallContext): Promise<unknown>;
}

/** How long a call may take. */
export const CALL_TIMEOUT = 10_000;

/** A call that failed in the plugin, or never reached it. */
export class PluginCallError extends Error {
	override name = 'PluginCallError';
	/** The call never reached the plugin (e.g. its Worker isn't reachable yet); trying again may help. */
	readonly retryable: boolean;

	constructor(message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
		super(message, { cause: options.cause });
		this.retryable = options.retryable ?? false;
	}
}

const httpsUrl = z.url({ protocol: /^https$/ });

/** What the host needs to run the OAuth flow of a provider; reported by `describe`. */
export const providerConfigSchema = z.object({
	authorizeUrl: httpsUrl,
	tokenUrl: httpsUrl,
	scopes: z.array(z.string().min(1).max(200)).max(50),
	pkce: z.boolean()
});

export type ProviderConfig = z.output<typeof providerConfigSchema>;

/** The answer to `describe`: what the server code implements. */
export const describeResultSchema = z.object({
	authProviders: z.record(z.string(), providerConfigSchema),
	fields: z.array(z.string()),
	routes: z.array(z.string())
});

export type DescribeResult = z.output<typeof describeResultSchema>;

/** The answer to `profile`, checked before it signs anyone in. */
export const oauthProfileSchema = z.object({
	id: z.string().min(1).max(256),
	email: z.string().max(320).nullable(),
	emailVerified: z.boolean(),
	name: z.string().max(256).nullable(),
	avatarUrl: z.string().max(2048).nullable()
}) satisfies z.ZodType<OAuthProfile>;

/** Checks a `profile` answer; throws `PluginCallError` when it isn't a valid profile. */
export function parseProfile(value: unknown): OAuthProfile {
	const result = oauthProfileSchema.safeParse(value);

	if (!result.success) {
		const issue = result.error.issues[0];

		throw new PluginCallError(
			`The plugin's profile answer is not valid: ${issue ? `${issue.path.join('.') || 'profile'}: ${issue.message}` : 'unknown'}`
		);
	}

	return result.data;
}

/** The `PluginContext` the plugin's handlers get. */
export function pluginContext(
	manifest: Pick<PluginManifest, 'id' | 'version'>,
	context: PluginCallContext,
	fetch: typeof globalThis.fetch
): PluginContext {
	const prefix = `[plugin ${manifest.id}]`;

	return {
		plugin: { id: manifest.id, version: manifest.version },
		fetch,
		settings: {
			get: async (key) => (Object.hasOwn(context.settings, key) ? context.settings[key]! : null)
		},
		log: {
			info: (message, data) => console.info(prefix, message, ...(data === undefined ? [] : [data])),
			warn: (message, data) => console.warn(prefix, message, ...(data === undefined ? [] : [data])),
			error: (message, data) =>
				console.error(prefix, message, ...(data === undefined ? [] : [data]))
		}
	};
}

/** Runs a call against the plugin's `definePlugin(...)` export. Mirrored in `worker.ts`. */
export async function dispatch(
	definition: PluginDefinition | undefined,
	call: PluginCall,
	ctx: PluginContext
): Promise<unknown> {
	const plugin = definition ?? {};

	switch (call.type) {
		case 'describe': {
			const providers = plugin.authProviders ?? {};

			return {
				authProviders: Object.fromEntries(
					Object.entries(providers).map(([id, handler]) => [
						id,
						{
							authorizeUrl: handler.authorizeUrl,
							tokenUrl: handler.tokenUrl,
							scopes: handler.scopes,
							pkce: handler.pkce
						}
					])
				),
				fields: Object.keys(plugin.fields ?? {}),
				routes: Object.keys(plugin.routes ?? {})
			};
		}
		case 'profile': {
			const providers = plugin.authProviders ?? {};
			const handler = Object.hasOwn(providers, call.provider)
				? providers[call.provider]
				: undefined;

			if (typeof handler?.profile !== 'function') {
				throw new PluginCallError(`The plugin has no auth provider ${call.provider}`);
			}

			return handler.profile(call.accessToken, { clientId: call.credentials.clientId }, ctx);
		}
		default:
			throw new PluginCallError(`Unknown call: ${(call as { type: unknown }).type}`);
	}
}

/** Runs `describe` and checks the answer. */
export async function describePlugin(runtime: PluginRuntime): Promise<DescribeResult> {
	const result = describeResultSchema.safeParse(await runtime.call({ type: 'describe' }));

	if (!result.success) {
		const issue = result.error.issues[0];

		throw new PluginCallError(
			`The plugin's describe answer is not valid: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown'}`
		);
	}

	return result.data;
}

/** Rejects with `PluginCallError` when `promise` takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new PluginCallError(`No answer within ${ms / 1000} seconds`)),
			ms
		);
	});

	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
