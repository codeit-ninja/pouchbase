/**
 * The server side of a plugin: `export default definePlugin({ ... })` in the file that the
 * manifest's `server` points to. The host runs it in a sandbox (a Dynamic Worker on Cloudflare),
 * so the only way out is through `PluginContext`: `ctx.fetch` reaches the hosts from
 * `permissions.network`, and nothing else.
 *
 * Every key of `fields` and `authProviders` must match a contribution in the manifest.
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
