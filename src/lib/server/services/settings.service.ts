import type { ServiceError } from './base.service';
import type { ResultAsync } from 'neverthrow';

import { eq, inArray, sql } from 'drizzle-orm';
import { fromPromise } from 'neverthrow';

import { settings } from '../db';
import { Service } from './base.service';

export type SettingKey =
	| 'installed_at'
	| 'app_database_id'
	| 'app_database_name'
	/** Secret for signing app user tokens. */
	| 'auth_token_secret'
	/** `true` when app users can sign in with email and password. */
	| 'auth_password_enabled'
	/** `true` when app users can sign up themselves with email and password. */
	| 'auth_password_signup'
	/** `true` when app users must verify their email address before signing in with a password. */
	| 'auth_password_verify'
	/** Name of the storage bucket that holds uploaded files. */
	| 'files_bucket_name'
	/** The Workers plan of the Cloudflare account (`free` or `paid`), for the dashboard's limits. */
	| 'cloudflare_plan'
	/** How mail is sent: `none`, `cloudflare` (Email Service) or `smtp`. */
	| 'mail_provider'
	| 'mail_sender_name'
	| 'mail_sender_address'
	| 'smtp_host'
	| 'smtp_port'
	/** `tls`, `starttls` or `none`. */
	| 'smtp_security'
	| 'smtp_username'
	| 'smtp_password'
	/** Where uploaded files are stored: `r2` (the default) or `s3` (an S3-compatible bucket). */
	| 'storage_provider'
	| 's3_endpoint'
	| 's3_region'
	| 's3_bucket'
	| 's3_access_key_id'
	| 's3_secret_access_key'
	/** `true` for path-style URLs (`https://host/bucket/key`). */
	| 's3_path_style'
	/** JSON: the previous storage while its files are copied to the new one, and how far it got. */
	| 'storage_migration'
	/** URL of the instance this one publishes to and pulls from (see `EnvironmentsService`). */
	| 'environment_remote_url'
	/** Deploy token of that instance. */
	| 'environment_remote_token'
	/** `development` or `production` (see `EnvironmentsService`); unset on instances that don't use environments. */
	| 'environment'
	/** Secret in the URL of `GET /api/types`, which serves the TypeScript types of the collections. */
	| 'types_token'
	/** JSON: the latest release on GitHub and when it was looked up (see `UpdatesService`). */
	| 'update_check';

export class SettingsService extends Service {
	get(key: SettingKey): ResultAsync<string | null, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		return fromPromise(this.db.select().from(settings).where(eq(settings.key, key)), (error) =>
			this.error(5000, 'GET_SETTING_FAILED', error)
		).map(([row]) => row?.value ?? null);
	}

	/** Several settings in one query; missing ones are `null`. */
	getMany<Key extends SettingKey>(
		keys: readonly Key[]
	): ResultAsync<Record<Key, string | null>, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		return fromPromise(
			this.db
				.select()
				.from(settings)
				.where(inArray(settings.key, [...keys])),
			(error) => this.error(5000, 'GET_SETTING_FAILED', error)
		).map(
			(rows) =>
				Object.fromEntries(
					keys.map((key) => [key, rows.find((row) => row.key === key)?.value ?? null])
				) as Record<Key, string | null>
		);
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

	/** Several settings in one statement. */
	setMany(
		values: Partial<Record<SettingKey, string>>
	): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		const rows = Object.entries(values).map(([key, value]) => ({ key, value: value as string }));

		return fromPromise(
			this.db
				.insert(settings)
				.values(rows)
				.onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } }),
			(error) => this.error(5001, 'SET_SETTING_FAILED', error)
		).map(() => undefined);
	}
}
