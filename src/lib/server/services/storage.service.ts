import type { ErrorOf, ServiceError } from './base.service';
import type { FilesService, StoredFile } from './files.service';
import type { S3Config, StorageDriver } from '../platform';
import type { StorageProvider } from '#lib/schemas/storage.js';
import type { RequestEvent } from '@sveltejs/kit';
import type { ResultAsync } from 'neverthrow';

import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { STORAGE_PROVIDERS } from '#lib/schemas/storage.js';

import { createS3Storage, storage } from '../platform';
import { Service } from './base.service';
import { storageKeys } from './files.service';

const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Written and deleted again when S3 settings are saved, to check that they work. */
const CONNECTION_TEST_KEY = '.pouchbase-connection-test';

/** Files read per migration step, and the objects (files and thumbnails) copied per step at most. */
const FILES_PER_STEP = 10;
const OBJECTS_PER_STEP = 16;

const KEYS = [
	'storage_provider',
	's3_endpoint',
	's3_region',
	's3_bucket',
	's3_access_key_id',
	's3_secret_access_key',
	's3_path_style',
	'storage_migration'
] as const;

/** The storage settings as shown on the Storage page; the secret key never leaves the server. */
export type StorageSettings = {
	provider: StorageProvider;
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	pathStyle: boolean;
	hasSecretAccessKey: boolean;
};

export type UpdateStorageSettingsInput = Omit<StorageSettings, 'hasSecretAccessKey'> & {
	/** Empty keeps the stored secret. */
	secretAccessKey?: string;
};

/** A pending migration as shown on the Storage page; no credentials. */
export type MigrationStatus = {
	source: { provider: StorageProvider; endpoint: string; bucket: string };
	total: number;
	done: number;
};

export type MigrationProgress = { total: number; done: number; finished: boolean };

type StoredSettings = Omit<StorageSettings, 'hasSecretAccessKey'> & { secretAccessKey: string };

/**
 * After switching to other storage, the files stay in the previous one (`source`) until they are
 * copied over; `cursor` is the id of the last file that was copied.
 */
type Migration = { source: StoredSettings; cursor: string | null };

type State = { current: StoredSettings; migration: Migration | null };

/** A driver and the bucket to use with it. */
type Target = { driver: StorageDriver; bucket: string };

/** Where files go, and where files that weren't migrated yet are read from. */
type Locations = { target: Target; source: Target | null };

type TargetError =
	| ServiceError<5000, 'GET_SETTING_FAILED'>
	| ServiceError<5001, 'SET_SETTING_FAILED'>
	| ServiceError<12000, 'STORAGE_SETUP_FAILED'>;

type ConnectionFailed = ServiceError<12004, 'CONNECTION_FAILED'> & { data: { reason: string } };

type MigrationFailed = ServiceError<12006, 'MIGRATION_FAILED'> & { data: { reason: string } };

type ScanError = ErrorOf<ReturnType<FilesService['scan']>>;

// The R2 bucket name never changes once set; cache it per isolate.
let bucketName: string | null = null;

// The storage settings can change, so they are only cached for the request that read them.
const cache = new WeakMap<RequestEvent, ResultAsync<Locations, TargetError>>();

/** Random bucket name, e.g. `pb-files-k3x9q0w2m7a1`. */
function randomBucketName() {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return `pb-files-${Array.from(bytes, (byte) => NAME_ALPHABET[byte % NAME_ALPHABET.length]).join('')}`;
}

/** Whether both settings point at the same bucket (other credentials don't move the files). */
function sameLocation(a: StoredSettings, b: StoredSettings) {
	return (
		a.provider === b.provider &&
		(a.provider === 'r2' || (a.endpoint === b.endpoint && a.bucket === b.bucket))
	);
}

function parseMigration(value: string | null): Migration | null {
	try {
		const parsed = value ? (JSON.parse(value) as Migration) : null;
		return parsed?.source ? parsed : null;
	} catch {
		return null;
	}
}

function reason(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function s3Config(settings: StoredSettings): S3Config {
	return {
		endpoint: settings.endpoint,
		region: settings.region,
		accessKeyId: settings.accessKeyId,
		secretAccessKey: settings.secretAccessKey,
		pathStyle: settings.pathStyle
	};
}

/**
 * Object storage for uploaded files: R2 on the Cloudflare account by default, or an S3-compatible
 * bucket configured on the Storage page.
 */
export class StorageService extends Service {
	settings(): ResultAsync<StorageSettings, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		return this.state().map(({ current: { secretAccessKey, ...settings } }) => ({
			...settings,
			hasSecretAccessKey: !!secretAccessKey
		}));
	}

	/**
	 * Saves the settings; S3 settings are only saved when a test object can be written. When the
	 * files move to another bucket, the previous one is remembered until they are migrated.
	 */
	update(
		input: UpdateStorageSettingsInput
	): ResultAsync<
		void,
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ConnectionFailed
		| ServiceError<12005, 'MIGRATION_PENDING'>
		| ScanError
	> {
		return this.state()
			.andThen(({ current, migration }) => {
				const next: StoredSettings = {
					...input,
					secretAccessKey: input.secretAccessKey || current.secretAccessKey
				};
				const moving = !sameLocation(current, next);

				if (moving && migration) {
					return errAsync(this.error(12005, 'MIGRATION_PENDING'));
				}

				return (next.provider === 's3' ? this.testConnection(next) : okAsync(undefined))
					.andThen(() =>
						moving
							? this.services
									.files()
									.scan(null, 0)
									.map(({ total }) => total > 0)
							: okAsync(false)
					)
					.andThen((hasFiles) =>
						this.services.settings().setMany({
							storage_provider: next.provider,
							s3_endpoint: next.endpoint,
							s3_region: next.region,
							s3_bucket: next.bucket,
							s3_access_key_id: next.accessKeyId,
							s3_secret_access_key: next.secretAccessKey,
							s3_path_style: String(next.pathStyle),
							...(hasFiles && {
								storage_migration: JSON.stringify({ source: current, cursor: null })
							})
						})
					);
			})
			.map(() => {
				cache.delete(this.ctx);
			});
	}

	/** The pending migration, or `null` when all files are in the current storage. */
	migration(): ResultAsync<
		MigrationStatus | null,
		ServiceError<5000, 'GET_SETTING_FAILED'> | ScanError
	> {
		return this.state().andThen(({ migration }) => {
			if (!migration) {
				return okAsync(null);
			}

			const { provider, endpoint, bucket } = migration.source;

			return this.services
				.files()
				.scan(migration.cursor, 0)
				.map(({ total, done }) => ({ source: { provider, endpoint, bucket }, total, done }));
		});
	}

	/**
	 * Copies the next few files (with their thumbnails) from the previous storage to the current one.
	 * Call it until `finished`: one step stays well within the subrequest limit of a Worker. The
	 * files are left in the previous storage.
	 */
	migrateNext(): ResultAsync<MigrationProgress, TargetError | ScanError | MigrationFailed> {
		return this.state().andThen(({ migration }) => {
			if (!migration) {
				return okAsync({ total: 0, done: 0, finished: true });
			}

			return this.locations()
				.andThen(({ target, source }) =>
					this.services
						.files()
						.scan(migration.cursor, FILES_PER_STEP)
						.andThen((scan) =>
							fromPromise(
								this.copy(scan.files, source ?? target, target),
								(error): MigrationFailed => ({
									...this.error(12006, 'MIGRATION_FAILED', error),
									data: { reason: reason(error) }
								})
							).map((copied) => ({ scan, copied }))
						)
				)
				.andThen(({ scan, copied }) => {
					const finished = copied === scan.files.length && scan.files.length < FILES_PER_STEP;
					const cursor = scan.files[copied - 1]?.id ?? migration.cursor;

					return this.services
						.settings()
						.set(
							'storage_migration',
							finished ? '' : JSON.stringify({ source: migration.source, cursor })
						)
						.map(() => {
							cache.delete(this.ctx);

							return {
								total: scan.total,
								done: finished ? scan.total : Math.min(scan.total, scan.done + copied),
								finished
							};
						});
				});
		});
	}

	/** Forgets the previous storage: files that weren't migrated can no longer be read. */
	skipMigration(): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		return this.services
			.settings()
			.set('storage_migration', '')
			.map(() => {
				cache.delete(this.ctx);
			});
	}

	/** The R2 bucket for uploads; created on first use, its name is stored in the settings. */
	bucket(): ResultAsync<string, TargetError> {
		if (bucketName) {
			return okAsync(bucketName);
		}

		const settings = this.services.settings();

		return settings
			.get('files_bucket_name')
			.andThen((existing) => {
				if (existing) {
					return okAsync(existing);
				}

				const name = randomBucketName();

				return fromPromise(
					(async () => {
						if (!(await storage.bucketExists(name))) {
							await storage.createBucket(name);
						}
					})(),
					(error) => this.error(12000, 'STORAGE_SETUP_FAILED', error)
				)
					.andThen(() => settings.set('files_bucket_name', name))
					.map(() => name);
			})
			.map((name) => {
				bucketName = name;
				return name;
			});
	}

	put(
		key: string,
		body: ArrayBuffer,
		contentType: string
	): ResultAsync<void, TargetError | ServiceError<12001, 'UPLOAD_FAILED'>> {
		return this.locations().andThen(({ target: { driver, bucket } }) =>
			fromPromise(driver.putObject(bucket, key, body, contentType), (error) =>
				this.error(12001, 'UPLOAD_FAILED', error)
			)
		);
	}

	/**
	 * The object as a streaming response, or `null` when it doesn't exist. During a migration,
	 * files that weren't copied yet are read from the previous storage.
	 */
	get(
		key: string
	): ResultAsync<Response | null, TargetError | ServiceError<12002, 'DOWNLOAD_FAILED'>> {
		return this.locations().andThen(({ target, source }) =>
			fromPromise(
				(async () =>
					(await target.driver.getObject(target.bucket, key)) ??
					(source ? await source.driver.getObject(source.bucket, key) : null))(),
				(error) => this.error(12002, 'DOWNLOAD_FAILED', error)
			)
		);
	}

	delete(keys: string[]): ResultAsync<void, TargetError | ServiceError<12003, 'DELETE_FAILED'>> {
		if (!keys.length) {
			return okAsync(undefined);
		}

		return this.locations().andThen(({ target, source }) =>
			fromPromise(
				(async () => {
					await Promise.all(keys.map((key) => target.driver.deleteObject(target.bucket, key)));

					// Not migrated yet: remove it there too, so it isn't copied later (best effort).
					if (source) {
						await Promise.all(
							keys.map((key) => source.driver.deleteObject(source.bucket, key))
						).catch(() => undefined);
					}
				})(),
				(error) => this.error(12003, 'DELETE_FAILED', error)
			)
		);
	}

	private locations(): ResultAsync<Locations, TargetError> {
		const cached = cache.get(this.ctx);

		if (cached) {
			return cached;
		}

		const locations = this.state().andThen(({ current, migration }) =>
			this.locate(current).andThen((target) =>
				migration
					? this.locate(migration.source).map((source) => ({ target, source }))
					: okAsync({ target, source: null })
			)
		);

		cache.set(this.ctx, locations);

		return locations;
	}

	private locate(settings: StoredSettings): ResultAsync<Target, TargetError> {
		return settings.provider === 's3'
			? okAsync({ driver: createS3Storage(s3Config(settings)), bucket: settings.bucket })
			: this.bucket().map((bucket) => ({ driver: storage, bucket }));
	}

	/**
	 * Copies files with their thumbnails until the step's budget is used (always at least one file)
	 * and returns how many files were copied. Objects missing in `source` are skipped.
	 */
	private async copy(files: StoredFile[], source: Target, target: Target) {
		let objects = 0;
		let copied = 0;

		for (const file of files) {
			const keys = storageKeys(file);

			if (copied > 0 && objects + keys.length > OBJECTS_PER_STEP) {
				break;
			}

			await Promise.all(
				keys.map(async (key) => {
					const object = await source.driver.getObject(source.bucket, key);

					if (!object) {
						return;
					}

					await target.driver.putObject(
						target.bucket,
						key,
						await object.arrayBuffer(),
						object.headers.get('content-type') ?? file.mimeType
					);
				})
			);

			objects += keys.length;
			copied++;
		}

		return copied;
	}

	private testConnection(settings: StoredSettings): ResultAsync<void, ConnectionFailed> {
		const driver = createS3Storage(s3Config(settings));

		return fromPromise(
			(async () => {
				await driver.putObject(
					settings.bucket,
					CONNECTION_TEST_KEY,
					new TextEncoder().encode('ok').buffer as ArrayBuffer,
					'text/plain'
				);
				await driver.deleteObject(settings.bucket, CONNECTION_TEST_KEY);
			})(),
			(error): ConnectionFailed => ({
				...this.error(12004, 'CONNECTION_FAILED', error),
				data: { reason: reason(error) }
			})
		);
	}

	private state(): ResultAsync<State, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		return this.services
			.settings()
			.getMany(KEYS)
			.map((values) => {
				const provider = values.storage_provider as StorageProvider;

				return {
					current: {
						provider: STORAGE_PROVIDERS.includes(provider) ? provider : 'r2',
						endpoint: values.s3_endpoint ?? '',
						region: values.s3_region ?? '',
						bucket: values.s3_bucket ?? '',
						accessKeyId: values.s3_access_key_id ?? '',
						secretAccessKey: values.s3_secret_access_key ?? '',
						pathStyle: values.s3_path_style === 'true'
					},
					migration: parseMigration(values.storage_migration)
				};
			});
	}
}
