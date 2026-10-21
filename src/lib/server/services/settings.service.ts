import type { ServiceError } from './base.service';
import type { ResultAsync } from 'neverthrow';

import { eq } from 'drizzle-orm';
import { fromPromise } from 'neverthrow';

import { settings } from '../db';
import { Service } from './base.service';

export type SettingKey =
	| 'app_name'
	| 'installed_at'
	| 'app_database_id'
	| 'app_database_name'
	/** Secret for signing app user tokens. */
	| 'auth_token_secret'
	/** `true` when app users can sign in with username and password. */
	| 'auth_password_enabled'
	/** `true` when app users can sign up themselves with username and password. */
	| 'auth_password_signup';

export class SettingsService extends Service {
	get(key: SettingKey): ResultAsync<string | null, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		return fromPromise(this.db.select().from(settings).where(eq(settings.key, key)), (error) =>
			this.error(5000, 'GET_SETTING_FAILED', error)
		).map(([row]) => row?.value ?? null);
	}

	set(key: SettingKey, value: string): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		return fromPromise(
			this.db
				.insert(settings)
				.values({ key, value })
				.onConflictDoUpdate({ target: settings.key, set: { value } }),
			(error) => this.error(5001, 'SET_SETTING_FAILED', error)
		).map(() => undefined);
	}
}
