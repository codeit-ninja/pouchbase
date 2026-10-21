import type { ServiceError } from './base.service';
import type { OAuthProvider } from '#lib/auth/oauth-providers.js';
import type { ResultAsync } from 'neverthrow';

import { eq } from 'drizzle-orm';
import { errAsync, fromPromise } from 'neverthrow';

import { OAUTH_PROVIDER_IDS } from '#lib/auth/oauth-providers.js';

import { oauthProviders } from '../db';
import { Service } from './base.service';

/** A provider as shown on the settings page; the secret itself never leaves the server. */
export type OAuthProviderSettings = {
	provider: OAuthProvider;
	enabled: boolean;
	clientId: string;
	hasSecret: boolean;
};

export type OAuthProviderCredentials = {
	enabled: boolean;
	clientId: string;
	clientSecret: string;
};

export type UpdateOAuthProviderInput = {
	enabled: boolean;
	clientId: string;
	/** Empty keeps the stored secret. */
	clientSecret?: string;
};

export class OAuthProvidersService extends Service {
	/** Every supported provider, with its stored configuration (or defaults). */
	list(): ResultAsync<OAuthProviderSettings[], ServiceError<10000, 'LIST_PROVIDERS_FAILED'>> {
		return fromPromise(this.db.select().from(oauthProviders), (error) =>
			this.error(10000, 'LIST_PROVIDERS_FAILED', error)
		).map((rows) =>
			OAUTH_PROVIDER_IDS.map((provider) => {
				const row = rows.find((candidate) => candidate.provider === provider);

				return {
					provider,
					enabled: row?.enabled ?? false,
					clientId: row?.clientId ?? '',
					hasSecret: !!row?.clientSecret
				};
			})
		);
	}

	credentials(
		provider: OAuthProvider
	): ResultAsync<OAuthProviderCredentials | null, ServiceError<10001, 'GET_PROVIDER_FAILED'>> {
		return fromPromise(
			this.db.select().from(oauthProviders).where(eq(oauthProviders.provider, provider)),
			(error) => this.error(10001, 'GET_PROVIDER_FAILED', error)
		).map(([row]) =>
			row ? { enabled: row.enabled, clientId: row.clientId, clientSecret: row.clientSecret } : null
		);
	}

	update(
		provider: OAuthProvider,
		input: UpdateOAuthProviderInput
	): ResultAsync<
		void,
		| ServiceError<10001, 'GET_PROVIDER_FAILED'>
		| ServiceError<10002, 'UPDATE_PROVIDER_FAILED'>
		| ServiceError<10003, 'PROVIDER_INCOMPLETE'>
	> {
		return this.credentials(provider).andThen((current) => {
			const clientId = input.clientId.trim();
			const clientSecret = input.clientSecret?.trim() || current?.clientSecret || '';

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
}
