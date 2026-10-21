import type { ServiceError } from './base.service';

import { errAsync, fromPromise, okAsync, ResultAsync } from 'neverthrow';

import { createDatabase, ensureDatabase, getDatabaseId } from '../cloudflare/d1';
import { migrate } from '../db/migrate';
import { Service } from './base.service';

export type AppDatabase = {
	id: string;
	name: string;
};

// Migrations only need to run once per isolate.
let migrated = false;

const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Random D1 database name for the app database, e.g. `pb-k3x9q0w2m7a1`. */
function randomDatabaseName() {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return `pb-${Array.from(bytes, (byte) => NAME_ALPHABET[byte % NAME_ALPHABET.length]).join('')}`;
}

export class DatabaseService extends Service {
	/** Whether the system database exists (it is created during installation). */
	exists(): ResultAsync<boolean, ServiceError<1000, 'DATABASE_LOOKUP_FAILED'>> {
		return fromPromise(getDatabaseId(), (error) =>
			this.error(1000, 'DATABASE_LOOKUP_FAILED', error)
		).map((id) => id !== null);
	}

	/** Creates the system database through the Cloudflare API if needed, then runs pending migrations. */
	prepare(): ResultAsync<
		void,
		ServiceError<1001, 'DATABASE_CREATE_FAILED'> | ServiceError<1002, 'DATABASE_MIGRATION_FAILED'>
	> {
		return fromPromise(ensureDatabase(), (error) =>
			this.error(1001, 'DATABASE_CREATE_FAILED', error)
		).andThen(() => this.migrate());
	}

	/** Applies pending migrations to the system database (once per isolate). */
	migrate(): ResultAsync<void, ServiceError<1002, 'DATABASE_MIGRATION_FAILED'>> {
		if (migrated) {
			return okAsync(undefined);
		}

		return fromPromise(migrate(), (error) =>
			this.error(1002, 'DATABASE_MIGRATION_FAILED', error)
		).map(() => {
			migrated = true;
		});
	}

	/** The app database, or `null` when it hasn't been created yet. */
	getApp(): ResultAsync<AppDatabase | null, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		const settings = this.services.settings();

		return ResultAsync.combine([
			settings.get('app_database_id'),
			settings.get('app_database_name')
		]).map(([id, name]) => (id && name ? { id, name } : null));
	}

	/** The app database; an error when it hasn't been created yet. */
	requireApp(): ResultAsync<
		AppDatabase,
		ServiceError<1004, 'APP_DATABASE_MISSING'> | ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		return this.getApp().andThen((appDatabase) =>
			appDatabase ? okAsync(appDatabase) : errAsync(this.error(1004, 'APP_DATABASE_MISSING'))
		);
	}

	/**
	 * Creates the app database with a random name and stores it in the settings.
	 * Returns the existing one if it was already created, so it is safe to retry.
	 */
	createApp(): ResultAsync<
		AppDatabase,
		| ServiceError<1003, 'APP_DATABASE_CREATE_FAILED'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
	> {
		return this.getApp().andThen((existing) => {
			if (existing) {
				return okAsync(existing);
			}

			const settings = this.services.settings();

			return fromPromise(createDatabase(randomDatabaseName()), (error) =>
				this.error(1003, 'APP_DATABASE_CREATE_FAILED', error)
			)
				.map((database): AppDatabase => ({ id: database.uuid, name: database.name }))
				.andThen((database) =>
					settings
						.set('app_database_id', database.id)
						.andThen(() => settings.set('app_database_name', database.name))
						.map(() => database)
				);
		});
	}
}
