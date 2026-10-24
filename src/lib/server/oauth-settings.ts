import type { OAuthProvider } from '#lib/auth/oauth-providers.js';
import type { oauthProviders, pluginAuthProviders } from './db/schema';
import type { ProviderConfig } from './plugins/runtime';

import { providerIconPath } from '#lib/auth/oauth-providers.js';

import { embeddedPlugin } from './plugins/embedded';

/**
 * Sign-in providers as `OAuthProvidersService` reads them: a row of `plugin_auth_providers` (the
 * provider a plugin contributes) joined with `oauth_providers` (the client id and secret the
 * admin entered) and the installed plugin's version.
 */

/** A provider as shown on the settings page; the secret itself never leaves the server. */
export type OAuthProviderSettings = {
	provider: OAuthProvider;
	/** The plugin that contributes the provider. */
	pluginId: string;
	label: string;
	/** Where the admin registers the OAuth app; `null` when the plugin doesn't say. */
	consoleUrl: string | null;
	/** The logo, served by Pouchbase; `null` when the plugin has none. */
	iconUrl: string | null;
	enabled: boolean;
	clientId: string;
	hasSecret: boolean;
};

export type OAuthProviderCredentials = {
	enabled: boolean;
	clientId: string;
	clientSecret: string;
};

/** Everything a sign-in with the provider needs. Server only: it holds the client secret. */
export type OAuthProviderDetails = {
	provider: OAuthProvider;
	pluginId: string;
	label: string;
	config: ProviderConfig;
	credentials: OAuthProviderCredentials;
};

/** A row of `plugin_auth_providers` joined with its credentials and its plugin's version. */
export type ProviderJoinRow = {
	provider: typeof pluginAuthProviders.$inferSelect;
	credentials: typeof oauthProviders.$inferSelect | null;
	/** `plugins.version` of an installed plugin; `null` for a built-in one. */
	installedVersion: string | null;
};

/**
 * The version that busts the logo's cache: the installed plugin's, else the built-in one's.
 * `null` when neither exists (the row is about to be cleaned up).
 */
function pluginVersion(row: ProviderJoinRow) {
	return row.installedVersion ?? embeddedPlugin(row.provider.pluginId)?.manifest.version ?? null;
}

/** The settings page's view of a provider. */
export function toProviderSettings(row: ProviderJoinRow): OAuthProviderSettings {
	const { provider, credentials } = row;
	const version = pluginVersion(row);

	return {
		provider: provider.provider,
		pluginId: provider.pluginId,
		label: provider.label,
		consoleUrl: provider.consoleUrl,
		iconUrl:
			provider.icon && version ? providerIconPath(provider.pluginId, provider.icon, version) : null,
		enabled: credentials?.enabled ?? false,
		clientId: credentials?.clientId ?? '',
		hasSecret: !!credentials?.clientSecret
	};
}

/** What a sign-in needs from the row. */
export function toProviderDetails(row: ProviderJoinRow): OAuthProviderDetails {
	const { provider, credentials } = row;

	return {
		provider: provider.provider,
		pluginId: provider.pluginId,
		label: provider.label,
		config: {
			authorizeUrl: provider.authorizeUrl,
			tokenUrl: provider.tokenUrl,
			scopes: provider.scopes,
			pkce: provider.pkce
		},
		credentials: {
			enabled: credentials?.enabled ?? false,
			clientId: credentials?.clientId ?? '',
			clientSecret: credentials?.clientSecret ?? ''
		}
	};
}
