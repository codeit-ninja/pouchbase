import type { ServiceError } from './base.service';
import type { OAuthProvider } from '#lib/auth/oauth-providers.js';
import type {
	OAuthProviderCredentials,
	OAuthProviderDetails,
	OAuthProviderSettings,
	ProviderJoinRow
} from '../oauth-settings';
import type { ResultAsync } from 'neverthrow';

import { eq } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { oauthProviders, pluginAuthProviders, plugins } from '../db';
import { toProviderDetails, toProviderSettings } from '../oauth-settings';
import { Service } from './base.service';

export type {
	OAuthProviderCredentials,
	OAuthProviderDetails,
	OAuthProviderSettings
} from '../oauth-settings';

export type UpdateOAuthProviderInput = {
	enabled: boolean;
	clientId: string;
	/** Empty keeps the stored secret. */
	clientSecret?: string;
};

/**
 * The OAuth providers app users can sign in with, and their client id and secret. Every provider
 * comes from a plugin: `plugin_auth_providers` (kept up to date by `PluginsService`) says which
 * providers exist, `oauth_providers` holds what the admin entered. A row in `oauth_providers`
 * whose plugin is gone is ignored but kept, so the credentials come back when the plugin is
 * installed again.
 */

const JOIN_COLUMNS = {
	provider: pluginAuthProviders,
	credentials: oauthProviders,
	installedVersion: plugins.version
};

type ListFailed = ServiceError<10000, 'LIST_PROVIDERS_FAILED'>;

type GetFailed = ServiceError<10001, 'GET_PROVIDER_FAILED'>;

export class OAuthProvidersService extends Service {
	/** Every provider an installed or built-in plugin contributes, with its settings, by label. */
	list(): ResultAsync<OAuthProviderSettings[], ListFailed> {
		return this.sync()
			.andThen(() =>
				fromPromise(this.joined(), (error) => this.error(10000, 'LIST_PROVIDERS_FAILED', error))
			)
			.map((rows) => rows.map(toProviderSettings).sort((a, b) => a.label.localeCompare(b.label)));
	}

	/**
	 * Label and logo of every known provider, without registering the built-in plugins first;
	 * for showing linked accounts.
	 */
	labels(): ResultAsync<
		Map<OAuthProvider, Pick<OAuthProviderSettings, 'label' | 'iconUrl'>>,
		ListFailed
	> {
		return fromPromise(this.joined(), (error) =>
			this.error(10000, 'LIST_PROVIDERS_FAILED', error)
		).map(
			(rows) =>
				new Map(
					rows.map((row) => {
						const { label, iconUrl } = toProviderSettings(row);

						return [row.provider.provider, { label, iconUrl }];
					})
				)
		);
	}

	/** A provider with its OAuth config and credentials; `null` when no plugin contributes it. */
	find(provider: OAuthProvider): ResultAsync<OAuthProviderDetails | null, GetFailed> {
		return this.sync()
			.andThen(() =>
				fromPromise(this.joined(provider), (error) =>
					this.error(10001, 'GET_PROVIDER_FAILED', error)
				)
			)
			.map(([row]) => (row ? toProviderDetails(row) : null));
	}

	/** The stored credentials; `null` when no plugin contributes the provider. */
	credentials(provider: OAuthProvider): ResultAsync<OAuthProviderCredentials | null, GetFailed> {
		return this.find(provider).map((details) => details?.credentials ?? null);
	}

	update(
		provider: OAuthProvider,
		input: UpdateOAuthProviderInput
	): ResultAsync<
		void,
		| GetFailed
		| ServiceError<10002, 'UPDATE_PROVIDER_FAILED'>
		| ServiceError<10003, 'PROVIDER_INCOMPLETE'>
		| ServiceError<10004, 'PROVIDER_NOT_FOUND'>
	> {
		return this.credentials(provider).andThen((current) => {
			if (!current) {
				return errAsync(this.error(10004, 'PROVIDER_NOT_FOUND'));
			}

			const clientId = input.clientId.trim();
			const clientSecret = input.clientSecret?.trim() || current.clientSecret;

			// A provider can only be switched on once it can actually be used.
			if (input.enabled && (!clientId || !clientSecret)) {
				return errAsync(this.error(10003, 'PROVIDER_INCOMPLETE'));
			}

			const values = { enabled: input.enabled, clientId, clientSecret, updatedAt: new Date() };

			return fromPromise(
				this.db
					.insert(oauthProviders)
					.values({ provider, ...values })
					.onConflictDoUpdate({ target: oauthProviders.provider, set: values }),
				(error) => this.error(10002, 'UPDATE_PROVIDER_FAILED', error)
			).map(() => undefined);
		});
	}

	/**
	 * Registers the providers of the built-in plugins before they are read. A failure is logged and
	 * the providers registered before are used.
	 */
	private sync(): ResultAsync<void, never> {
		return this.services
			.plugins()
			.ensureEmbedded()
			.orElse((failure) => {
				console.error('[oauth] Could not register the built-in sign-in providers', failure);

				return okAsync(undefined);
			});
	}

	/** `plugin_auth_providers` ⟕ `oauth_providers` ⟕ `plugins`, optionally for one provider. */
	private joined(provider?: OAuthProvider): Promise<ProviderJoinRow[]> {
		const query = this.db
			.select(JOIN_COLUMNS)
			.from(pluginAuthProviders)
			.leftJoin(oauthProviders, eq(oauthProviders.provider, pluginAuthProviders.provider))
			.leftJoin(plugins, eq(plugins.id, pluginAuthProviders.pluginId));

		return provider ? query.where(eq(pluginAuthProviders.provider, provider)) : query;
	}
}
