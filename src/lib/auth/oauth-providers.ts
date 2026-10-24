/**
 * OAuth providers app users can sign in with. Every provider comes from a plugin (Google, GitHub,
 * Microsoft, Discord and Twitch are built in, see `plugins/auth-*`), so the list is only known on
 * the server: `OAuthProvidersService.list()`. Shared by the settings page and the server.
 */
export { PROVIDER_ID_PATTERN } from '@pouchbasejs/plugin-sdk';

/** A provider id, e.g. `google`: the id a plugin contributes it under, unique per instance. */
export type OAuthProvider = string;

/** Path of the callback URL to register at the provider. */
export function oauthCallbackPath(provider: OAuthProvider) {
	return `/api/auth/oauth2/${provider}/callback`;
}

/** Path of a provider's logo, served by `/api/plugins/[id]/assets/[...path]`. */
export function providerIconPath(pluginId: string, icon: string, version: string) {
	return `/api/plugins/${encodeURIComponent(pluginId)}/assets/${icon}?v=${encodeURIComponent(version)}`;
}
