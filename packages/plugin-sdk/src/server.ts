/**
 * The server side of a plugin: `export default definePlugin({ ... })` in the file that the
 * manifest's `server` points to. The host runs it in its own Worker on your Cloudflare account
 * (built-in plugins, which ship with Pouchbase, run inside Pouchbase), so the only way out is
 * through `PluginContext`: `ctx.fetch` reaches the HTTPS hosts from `permissions.network`, and
 * nothing else. The Worker has no bindings, and its global `fetch` has the same limits.
 *
 * Every key of `fields` and `authProviders` must match a contribution in the manifest.
 *
 * This module has no imports and uses only `fetch`-style Web APIs, so it bundles into the
 * sandboxed server code as is.
 */

export type PluginLogger = {
	info(message: string, data?: unknown): void;
	warn(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
};

/** Settings an admin entered for this plugin on the Plugins page; plain strings. */
export type PluginSettings = {
	get(key: string): Promise<string | null>;
};

export type PluginContext = {
	plugin: { id: string; version: string };
	/** `fetch`, limited to the hosts in `permissions.network`; other hosts are rejected. */
	fetch: typeof fetch;
	settings: PluginSettings;
	log: PluginLogger;
};

/** A value read from or written to the field's column. */
export type FieldValue = string | number | Uint8Array | null;

export type FieldValidation = { valid: true } | { valid: false; message: string };

export type FieldTypeHandler = {
	/**
	 * Checks a value from the record form or the API before it is saved. `options` are the field's
	 * settings. Missing accepts every value.
	 */
	validate?(
		value: unknown,
		options: Record<string, unknown>,
		ctx: PluginContext
	): FieldValidation | Promise<FieldValidation>;
	/** Turns a valid value into what is stored in the column. Missing stores it as is. */
	serialize?(value: unknown, ctx: PluginContext): FieldValue | Promise<FieldValue>;
	/** Turns the stored value into what the API returns. Missing returns it as stored. */
	deserialize?(value: FieldValue, ctx: PluginContext): unknown;
};

/** The provider's user, the same shape the built-in providers return. */
export type OAuthProfile = {
	id: string;
	email: string | null;
	/** Only verified emails may link a sign-in to an existing user. */
	emailVerified: boolean;
	name: string | null;
	avatarUrl: string | null;
};

export type AuthProviderHandler = {
	authorizeUrl: string;
	tokenUrl: string;
	scopes: string[];
	/** Send a PKCE code challenge. */
	pkce: boolean;
	/** Fetches the signed-in user with the access token, through `ctx.fetch`. */
	profile(
		accessToken: string,
		credentials: { clientId: string },
		ctx: PluginContext
	): Promise<OAuthProfile>;
};

/**
 * Handles requests to `/api/plugins/<plugin>/<path>`; keys are `"GET /stats"`, `"POST /sync"`.
 * Paths below `/assets/` are the host's: it serves the plugin's images there.
 * Requests from the dashboard come with the admin's session; other requests are anonymous.
 */
export type RouteHandler = (
	request: Request,
	ctx: PluginContext & { params: Record<string, string> }
) => Response | Promise<Response>;

export type PluginDefinition = {
	fields?: Record<string, FieldTypeHandler>;
	authProviders?: Record<string, AuthProviderHandler>;
	routes?: Record<`${'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} /${string}`, RouteHandler>;
};

/** Marks the default export of the server entry; returns the definition unchanged. */
export function definePlugin<T extends PluginDefinition>(definition: T): T {
	return definition;
}

/** Types a field type handler written outside `definePlugin`; returns it unchanged. */
export function defineField<T extends FieldTypeHandler>(handler: T): T {
	return handler;
}

/** Types an auth provider written outside `definePlugin`; returns it unchanged. */
export function defineAuthProvider<T extends AuthProviderHandler>(handler: T): T {
	return handler;
}

/**
 * GETs JSON from an API with the user's access token, through `ctx.fetch`; for the profile of
 * an auth provider, e.g. `fetchJson<GitHubUser>(ctx, 'https://api.github.com/user', token)`.
 * Sends `Authorization: Bearer <token>`, `Accept: application/json` and a `User-Agent` (some
 * APIs require one); `headers` adds to or overrides them. Throws when the response is not 2xx.
 */
export async function fetchJson<T>(
	ctx: Pick<PluginContext, 'fetch'>,
	url: string,
	accessToken: string,
	headers: Record<string, string> = {}
): Promise<T> {
	const response = await ctx.fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
			'User-Agent': 'Pouchbase',
			...headers
		}
	});

	if (!response.ok) {
		throw new Error(`Request failed (${response.status}): ${url}`);
	}

	return (await response.json()) as T;
}

/** The standard claims of an OpenID Connect userinfo response, plus whatever else it has. */
export type OidcClaims = {
	sub: string;
	email?: string;
	/** Some providers send it as a string. */
	email_verified?: boolean | string;
	name?: string;
	preferred_username?: string;
	picture?: string;
	[claim: string]: unknown;
};

export type OidcProviderOptions = {
	authorizeUrl: string;
	tokenUrl: string;
	/** The provider's OpenID Connect userinfo endpoint. */
	userinfoUrl: string;
	/** Default `['openid', 'email', 'profile']`. */
	scopes?: string[];
	/** Send a PKCE code challenge; default `true`. */
	pkce?: boolean;
	/**
	 * Adjusts the profile mapped from the standard claims, e.g. to distrust `email_verified` or
	 * to read a custom claim. Missing returns `profile` as is.
	 */
	mapProfile?(
		claims: OidcClaims,
		profile: OAuthProfile,
		ctx: PluginContext
	): OAuthProfile | Promise<OAuthProfile>;
};

/**
 * An auth provider for an OpenID Connect provider: its profile comes from the userinfo endpoint
 * (`sub`, `email`, `email_verified`, `name`, `picture`).
 *
 * ```ts
 * export default definePlugin({
 * 	authProviders: {
 * 		google: createOidcProvider({
 * 			authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
 * 			tokenUrl: 'https://oauth2.googleapis.com/token',
 * 			userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo'
 * 		})
 * 	}
 * });
 * ```
 *
 * The host of `userinfoUrl` must be in `permissions.network`.
 */
export function createOidcProvider(options: OidcProviderOptions): AuthProviderHandler {
	return {
		authorizeUrl: options.authorizeUrl,
		tokenUrl: options.tokenUrl,
		scopes: options.scopes ?? ['openid', 'email', 'profile'],
		pkce: options.pkce ?? true,
		async profile(accessToken, _credentials, ctx) {
			const claims = await fetchJson<OidcClaims>(ctx, options.userinfoUrl, accessToken);

			if (typeof claims?.sub !== 'string' || !claims.sub) {
				throw new Error(`The userinfo response has no sub claim: ${options.userinfoUrl}`);
			}

			const email = typeof claims.email === 'string' && claims.email ? claims.email : null;
			const profile: OAuthProfile = {
				id: claims.sub,
				email,
				emailVerified:
					email !== null && (claims.email_verified === true || claims.email_verified === 'true'),
				name: claims.name || claims.preferred_username || null,
				avatarUrl: typeof claims.picture === 'string' && claims.picture ? claims.picture : null
			};

			return options.mapProfile ? options.mapProfile(claims, profile, ctx) : profile;
		}
	};
}
