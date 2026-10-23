import type { ServiceError } from './base.service';
import type { ObjectStore } from '../platform';
import type { ResultAsync } from 'neverthrow';

import { and, asc, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import type { DatabaseFile } from '#lib/backups/archive.js';

import {
	ARCHIVE_FILES,
	DATABASE_FILES,
	tarEnd,
	tarHeader,
	tarPadding,
	tarSize
} from '#lib/backups/archive.js';
import { nextRun, parseCron } from '#lib/backups/cron.js';
import { splitStatements } from '#lib/backups/sql.js';

import { createS3Storage } from '../platform';
import {
	backupDestinations,
	backupFiles,
	backupRestores,
	backups,
	backupSchedules,
	settings
} from '../db';
import {
	batchDatabase,
	exportDatabase,
	getDatabaseId,
	importDatabase,
	pollDatabaseImport,
	queryDatabase,
	queryObjects
} from '../db/query';
import { Service } from './base.service';
import { forgetFilesCollection, storageKeys } from './files.service';

/**
 * Backups of the system and app databases to S3-compatible buckets, made right away or on a
 * schedule, and restores of them.
 *
 * Backups and restores run in steps, so a step stays within the limits of a Worker invocation and
 * an interrupted job continues where it was. Steps are run by `advance()`: from the Backups page
 * while it is open, and from `tick()`, which a Cron Trigger (Workers) or a timer (Node) calls every
 * minute (see `src/routes/internal/tick`).
 *
 * In the destination, every backup is a folder `<prefix>/<timestamp>-<random>/` with
 * `system.sql`, `app.sql` (D1 dumps) and `manifest.json`. Uploaded files are copied once to
 * `<prefix>/files/<storage key>`, shared by all backups: uploads never change, so a backup only
 * copies the new ones, and files are never removed there, so every backup can be restored.
 */

const MANIFEST_FORMAT = 1;

/** A step is considered stuck (and may be taken over) after this long. */
const LOCK_MS = 3 * 60 * 1000;

/** Failed attempts of a step before the job fails. */
const MAX_ATTEMPTS = 5;

/** Files read per step, and objects copied per step at most (subrequest limit of Workers). */
const FILES_PER_STEP = 200;
const OBJECTS_PER_STEP = 12;

/** How long the restore of the system database is awaited within its step. */
const SYSTEM_IMPORT_TIMEOUT = 60 * 1000;

/**
 * App dumps up to this size are restored with D1's import (fast, but the file must be in memory to
 * compute its checksum). Larger ones are loaded in chunks of `LOAD_CHUNK` bytes, read with range
 * requests and run as batches of statements, so memory and CPU per step stay small.
 */
const IMPORT_LIMIT = 32 * 1024 * 1024;
const LOAD_CHUNK = 2 * 1024 * 1024;
const BATCH_STATEMENTS = 500;
const BATCH_BYTES = 512 * 1024;

/**
 * The app database a restore replaced is deleted this long after the switch, once every isolate
 * has picked up the new one (they cache it for a minute, see `DatabaseService.getApp`).
 */
const RETIRE_AFTER = 10 * 60 * 1000;

/** Polls of a database export within one step, before trying again in the next. */
const EXPORT_POLLS = 3;

/** Old backups of a schedule deleted per finished backup at most. */
const PRUNE_PER_STEP = 5;

/** An upload without progress for this long is given up. */
const UPLOAD_TIMEOUT = 24 * 60 * 60 * 1000;

/** Backups imported from a destination per call at most. */
const DISCOVER_LIMIT = 40;

const CONNECTION_TEST_FILE = '.pouchbase-connection-test';

/**
 * Tables of the system database that a restore keeps as they are now: the backups themselves (a
 * restore must not forget the backups made after the one it restores, nor itself) and the sessions
 * (so admins stay logged in). Order matters: referenced tables first.
 */
const PRESERVED_TABLES = [
	'backup_destinations',
	'backup_schedules',
	'backups',
	'backup_restores',
	'backup_files',
	'sessions'
] as const;

/**
 * Settings a restore sets itself: the app database (the spare one it loaded) and the bucket of this
 * installation.
 */
const PRESERVED_SETTINGS = ['app_database_id', 'app_database_name', 'files_bucket_name'];

const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

type Destination = typeof backupDestinations.$inferSelect;
type BackupRow = typeof backups.$inferSelect;
type RestoreRow = typeof backupRestores.$inferSelect;

type BackupState =
	| { step: 'export'; database: 'system' | 'app'; bookmark: string | null }
	| { step: 'files'; cursor: string | null }
	| { step: 'finish' }
	| {
			step: 'upload';
			manifest: Manifest;
			/** The multipart upload of each database file. */
			files: Partial<Record<DatabaseFile, UploadedFile>>;
			updatedAt: number;
	  };

type UploadedFile = { uploadId: string; etags: string[]; size: number; done: boolean };

type UploadState = Extract<BackupState, { step: 'upload' }>;

/** A database the backup is restored into before it becomes the app database. */
type SpareDatabase = { id: string; name: string };

/**
 * The app dump is loaded into a new database while the app keeps using the current one; restoring
 * the system database then switches to it, in the same transaction.
 */
type RestoreState = (
	| { step: 'app' }
	| { step: 'import'; database: SpareDatabase; bookmark: string | null }
	| { step: 'load'; database: SpareDatabase; offset: number; size: number }
	| { step: 'system'; database: SpareDatabase }
	| { step: 'files'; cursor: string | null }
	| { step: 'done' }
) & {
	/** The app database this restore replaced; deleted by `tick()` after `RETIRE_AFTER`. */
	retire?: { id: string; at: number };
};

type Manifest = {
	format: number;
	createdAt: string;
	includeFiles: boolean;
	size: number;
	files: number;
};

/** A destination as shown on the Backups page; the secret key never leaves the server. */
export type DestinationSummary = Omit<Destination, 'secretAccessKey' | 'createdAt'> & {
	hasSecretAccessKey: boolean;
};

export type SaveDestinationInput = Omit<Destination, 'id' | 'secretAccessKey' | 'createdAt'> & {
	/** Empty for a new destination. */
	id: string;
	/** Empty keeps the stored secret. */
	secretAccessKey?: string;
};

export type ScheduleSummary = Omit<typeof backupSchedules.$inferSelect, 'createdAt'> & {
	destinationName: string;
};

export type SaveScheduleInput = {
	/** Empty for a new schedule. */
	id: string;
	destinationId: string;
	cron: string;
	includeFiles: boolean;
	keep: number;
	enabled: boolean;
};

export type JobStatus = BackupRow['status'];

export type BackupSummary = {
	id: string;
	destinationId: string;
	destinationName: string;
	scheduled: boolean;
	status: JobStatus;
	/** What a running backup is doing. */
	step: string | null;
	includeFiles: boolean;
	size: number;
	files: number;
	error: string | null;
	startedAt: Date;
	finishedAt: Date | null;
};

export type RestoreSummary = {
	id: string;
	/** When the restored backup was made; `null` when it was deleted since. */
	backupStartedAt: Date | null;
	status: JobStatus;
	step: string | null;
	includeFiles: boolean;
	files: number;
	error: string | null;
	startedAt: Date;
	finishedAt: Date | null;
};

type QueryFailed = ServiceError<16000, 'BACKUPS_QUERY_FAILED'>;
type DestinationNotFound = ServiceError<16001, 'DESTINATION_NOT_FOUND'>;
type ConnectionFailed = ServiceError<16002, 'CONNECTION_FAILED'> & { data: { reason: string } };
type JobRunning = ServiceError<16003, 'JOB_RUNNING'>;
type BackupNotFound = ServiceError<16004, 'BACKUP_NOT_FOUND'>;
type BackupIncomplete = ServiceError<16005, 'BACKUP_INCOMPLETE'>;
type DeleteFailed = ServiceError<16006, 'DELETE_FAILED'> & { data: { reason: string } };
type DiscoverFailed = ServiceError<16007, 'DISCOVER_FAILED'> & { data: { reason: string } };
type InvalidSchedule = ServiceError<16008, 'INVALID_SCHEDULE'>;
type StepsFailed = ServiceError<16009, 'STEPS_FAILED'>;
type InvalidArchive = ServiceError<16010, 'INVALID_ARCHIVE'>;
type UploadNotActive = ServiceError<16011, 'UPLOAD_NOT_ACTIVE'>;
type TransferFailed = ServiceError<16012, 'TRANSFER_FAILED'> & { data: { reason: string } };

/** A failure of another service inside a step, kept as an error so the step can be retried. */
class StepError extends Error {}

function reason(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function randomSuffix(length: number) {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, (byte) => NAME_ALPHABET[byte % NAME_ALPHABET.length]).join('');
}

/** Folder of a new backup, e.g. `pouchbase/2026-10-23T03-00-00Z-k3x9`; sorts by date. */
function backupKey(prefix: string, date: Date) {
	const stamp = date
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replace(/:/g, '-');
	return `${prefix}/${stamp}-${randomSuffix(4)}`;
}

function parseState<T>(value: string, fallback: T): T {
	try {
		const parsed = JSON.parse(value) as T & { step?: string };
		return parsed?.step ? parsed : fallback;
	} catch {
		return fallback;
	}
}

function backupStep(state: BackupState) {
	switch (state.step) {
		case 'export':
			return state.database === 'system'
				? 'Exporting the system database'
				: 'Exporting the app database';
		case 'files':
			return 'Copying files';
		case 'finish':
			return 'Finishing';
		case 'upload':
			return 'Uploading';
	}
}

function parseManifest(value: unknown): Manifest | null {
	const manifest = value as Partial<Manifest> | null;

	if (
		!manifest ||
		typeof manifest !== 'object' ||
		manifest.format !== MANIFEST_FORMAT ||
		typeof manifest.createdAt !== 'string' ||
		Number.isNaN(Date.parse(manifest.createdAt))
	) {
		return null;
	}

	return {
		format: MANIFEST_FORMAT,
		createdAt: new Date(manifest.createdAt).toISOString(),
		includeFiles: !!manifest.includeFiles,
		size: Number(manifest.size) || 0,
		files: Number(manifest.files) || 0
	};
}

/** Writes a chunk to a stream that other writes and pipes also use. */
async function write(writable: WritableStream<Uint8Array>, chunk: Uint8Array) {
	const writer = writable.getWriter();

	try {
		await writer.write(chunk);
	} finally {
		writer.releaseLock();
	}
}

/** The files as a tar archive, streamed from their responses (see `#lib/backups/archive`). */
function archiveStream(
	files: { name: string; size: number; body: ReadableStream<Uint8Array> }[],
	modified: Date
) {
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

	void (async () => {
		try {
			for (const file of files) {
				await write(writable, tarHeader(file.name, file.size, modified));
				await file.body.pipeTo(writable, { preventClose: true });
				await write(writable, new Uint8Array(tarPadding(file.size)));
			}

			await write(writable, tarEnd());
			await writable.close();
		} catch (error) {
			console.warn(`[backups] download failed: ${reason(error)}`);
			await Promise.all(files.map((file) => file.body.cancel().catch(() => undefined)));
			await writable.abort(error).catch(() => undefined);
		}
	})();

	return readable;
}

function restoreStep(state: RestoreState) {
	switch (state.step) {
		case 'app':
			return 'Preparing a new app database';
		case 'import':
			return 'Importing the app database';
		case 'load':
			return `Loading the app database (${Math.floor((state.offset / Math.max(1, state.size)) * 100)}%)`;
		case 'system':
			return 'Restoring the system database';
		case 'files':
			return 'Restoring files';
		case 'done':
			return 'Finishing';
	}
}

function store(destination: Destination): ObjectStore {
	return createS3Storage({
		endpoint: destination.endpoint,
		region: destination.region,
		accessKeyId: destination.accessKeyId,
		secretAccessKey: destination.secretAccessKey,
		pathStyle: destination.pathStyle
	});
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A value as a SQL literal, for the statements a restore appends to a dump. */
function literal(value: unknown): string {
	if (value === null || value === undefined) {
		return 'NULL';
	}

	if (typeof value === 'number' || typeof value === 'bigint') {
		return String(value);
	}

	if (typeof value === 'boolean') {
		return value ? '1' : '0';
	}

	return `'${String(value).replace(/'/g, "''")}'`;
}

function identifier(name: string) {
	return `"${name.replace(/"/g, '""')}"`;
}

function insertStatement(table: string, row: Record<string, unknown>) {
	const columns = Object.keys(row);

	return `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(', ')}) VALUES (${columns
		.map((column) => literal(row[column]))
		.join(', ')});`;
}

/** Dropping everything first lets the dump create the tables as they were. */
async function dropStatements(databaseId: string) {
	const rows = await queryDatabase(
		databaseId,
		`SELECT "type", "name" FROM sqlite_master WHERE "type" IN ('table', 'view') AND "name" NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND "name" NOT LIKE '\\_cf\\_%' ESCAPE '\\'`
	);

	return rows.map(
		([type, name]) =>
			`DROP ${type === 'view' ? 'VIEW' : 'TABLE'} IF EXISTS ${identifier(String(name))};`
	);
}

function encode(...parts: (string | Uint8Array)[]) {
	const encoder = new TextEncoder();
	const chunks = parts.map((part) => (typeof part === 'string' ? encoder.encode(part) : part));
	const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
	let offset = 0;

	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return result;
}

export class BackupsService extends Service {
	destinations(): ResultAsync<DestinationSummary[], QueryFailed> {
		return this.query(() =>
			this.db.select().from(backupDestinations).orderBy(asc(backupDestinations.name))
		).map((rows) =>
			rows.map(({ secretAccessKey, ...destination }) => ({
				id: destination.id,
				name: destination.name,
				endpoint: destination.endpoint,
				region: destination.region,
				bucket: destination.bucket,
				accessKeyId: destination.accessKeyId,
				pathStyle: destination.pathStyle,
				prefix: destination.prefix,
				hasSecretAccessKey: !!secretAccessKey
			}))
		);
	}

	/**
	 * Creates or updates a destination; it is only saved when a test file can be written to it and
	 * deleted again.
	 */
	saveDestination(
		input: SaveDestinationInput
	): ResultAsync<string, QueryFailed | DestinationNotFound | ConnectionFailed> {
		const { id, secretAccessKey, ...fields } = input;

		return (id ? this.destination(id) : okAsync(null))
			.andThen((existing) => {
				if (id && !existing) {
					return errAsync(this.error(16001, 'DESTINATION_NOT_FOUND'));
				}

				const destination: Destination = {
					...fields,
					id: id || crypto.randomUUID(),
					secretAccessKey: secretAccessKey || existing?.secretAccessKey || '',
					createdAt: existing?.createdAt ?? new Date()
				};

				return this.testConnection(destination).map(() => destination);
			})
			.andThen((destination) =>
				this.query(() =>
					this.db
						.insert(backupDestinations)
						.values(destination)
						.onConflictDoUpdate({
							target: backupDestinations.id,
							set: {
								name: destination.name,
								endpoint: destination.endpoint,
								region: destination.region,
								bucket: destination.bucket,
								accessKeyId: destination.accessKeyId,
								secretAccessKey: destination.secretAccessKey,
								pathStyle: destination.pathStyle,
								prefix: destination.prefix
							}
						})
				).map(() => destination.id)
			);
	}

	/**
	 * Deletes a destination with its schedules and the list of its backups. The backups themselves
	 * stay in the bucket.
	 */
	deleteDestination(id: string): ResultAsync<void, QueryFailed | JobRunning> {
		return this.running().andThen((running) =>
			running
				? errAsync(this.error(16003, 'JOB_RUNNING'))
				: this.query(() =>
						this.db.delete(backupDestinations).where(eq(backupDestinations.id, id))
					).map(() => undefined)
		);
	}

	schedules(): ResultAsync<ScheduleSummary[], QueryFailed> {
		return this.query(() =>
			this.db
				.select({ schedule: backupSchedules, destinationName: backupDestinations.name })
				.from(backupSchedules)
				.innerJoin(backupDestinations, eq(backupDestinations.id, backupSchedules.destinationId))
				.orderBy(asc(backupSchedules.createdAt))
		).map((rows) =>
			rows.map(({ schedule, destinationName }) => ({
				id: schedule.id,
				destinationId: schedule.destinationId,
				cron: schedule.cron,
				includeFiles: schedule.includeFiles,
				keep: schedule.keep,
				enabled: schedule.enabled,
				nextRunAt: schedule.nextRunAt,
				lastRunAt: schedule.lastRunAt,
				destinationName
			}))
		);
	}

	saveSchedule(
		input: SaveScheduleInput
	): ResultAsync<void, QueryFailed | DestinationNotFound | InvalidSchedule> {
		const cron = parseCron(input.cron);
		const next = cron && nextRun(cron, new Date());

		if (!next) {
			return errAsync(this.error(16008, 'INVALID_SCHEDULE'));
		}

		const values = {
			destinationId: input.destinationId,
			cron: input.cron.trim(),
			includeFiles: input.includeFiles,
			keep: input.keep,
			enabled: input.enabled,
			nextRunAt: next
		};

		return this.destination(input.destinationId)
			.andThen((destination) =>
				destination ? okAsync(destination) : errAsync(this.error(16001, 'DESTINATION_NOT_FOUND'))
			)
			.andThen(() =>
				this.query(() =>
					input.id
						? this.db.update(backupSchedules).set(values).where(eq(backupSchedules.id, input.id))
						: this.db.insert(backupSchedules).values(values)
				)
			)
			.map(() => undefined);
	}

	deleteSchedule(id: string): ResultAsync<void, QueryFailed> {
		return this.query(() => this.db.delete(backupSchedules).where(eq(backupSchedules.id, id))).map(
			() => undefined
		);
	}

	/** The backups, newest first. */
	list(): ResultAsync<BackupSummary[], QueryFailed> {
		return this.query(() =>
			this.db
				.select({ backup: backups, destinationName: backupDestinations.name })
				.from(backups)
				.innerJoin(backupDestinations, eq(backupDestinations.id, backups.destinationId))
				.orderBy(desc(backups.startedAt))
				.limit(200)
		).map((rows) =>
			rows.map(({ backup, destinationName }) => ({
				id: backup.id,
				destinationId: backup.destinationId,
				destinationName,
				scheduled: !!backup.scheduleId,
				status: backup.status,
				step:
					backup.status === 'running'
						? backupStep(parseState<BackupState>(backup.state, { step: 'finish' }))
						: null,
				includeFiles: backup.includeFiles,
				size: backup.size,
				files: backup.files,
				error: backup.error,
				startedAt: backup.startedAt,
				finishedAt: backup.finishedAt
			}))
		);
	}

	/** The latest restore, or `null` when there never was one. */
	latestRestore(): ResultAsync<RestoreSummary | null, QueryFailed> {
		return this.query(() =>
			this.db
				.select({ restore: backupRestores, backupStartedAt: backups.startedAt })
				.from(backupRestores)
				.leftJoin(backups, eq(backups.id, backupRestores.backupId))
				.orderBy(desc(backupRestores.startedAt))
				.limit(1)
		).map(([row]) =>
			row
				? {
						id: row.restore.id,
						backupStartedAt: row.backupStartedAt,
						status: row.restore.status,
						step:
							row.restore.status === 'running'
								? restoreStep(parseState<RestoreState>(row.restore.state, { step: 'app' }))
								: null,
						includeFiles: row.restore.includeFiles,
						files: row.restore.files,
						error: row.restore.error,
						startedAt: row.restore.startedAt,
						finishedAt: row.restore.finishedAt
					}
				: null
		);
	}

	/** Starts a backup; its steps run with `advance()`. Returns its id. */
	start(
		destinationId: string,
		includeFiles: boolean,
		scheduleId: string | null = null
	): ResultAsync<string, QueryFailed | DestinationNotFound | JobRunning> {
		return this.destination(destinationId).andThen((destination) => {
			if (!destination) {
				return errAsync(this.error(16001, 'DESTINATION_NOT_FOUND'));
			}

			return this.restoring().andThen((restoring) => {
				if (restoring) {
					return errAsync(this.error(16003, 'JOB_RUNNING'));
				}

				const id = crypto.randomUUID();
				const state: BackupState = { step: 'export', database: 'system', bookmark: null };

				return this.query(() =>
					this.db.insert(backups).values({
						id,
						destinationId,
						scheduleId,
						key: backupKey(destination.prefix, new Date()),
						includeFiles,
						state: JSON.stringify(state)
					})
				).map(() => id);
			});
		});
	}

	/** Deletes a backup from its destination and from the list. */
	delete(id: string): ResultAsync<void, QueryFailed | BackupNotFound | JobRunning | DeleteFailed> {
		return this.query(() =>
			this.db
				.select({ backup: backups, destination: backupDestinations })
				.from(backups)
				.innerJoin(backupDestinations, eq(backupDestinations.id, backups.destinationId))
				.where(eq(backups.id, id))
		).andThen(([row]) => {
			if (!row) {
				return errAsync(this.error(16004, 'BACKUP_NOT_FOUND'));
			}

			// Uploads can be deleted, e.g. to give up on one.
			if (row.backup.status === 'running') {
				return errAsync(this.error(16003, 'JOB_RUNNING'));
			}

			return fromPromise(this.removeBackup(row.backup, row.destination), (error): DeleteFailed => ({
				...this.error(16006, 'DELETE_FAILED', error),
				data: { reason: reason(error) }
			}));
		});
	}

	/**
	 * A completed backup as a tar archive with its manifest and SQL dumps, streamed from the
	 * destination. `null` when there is no such backup. Uploaded files aren't included.
	 */
	archive(
		id: string
	): ResultAsync<
		{ filename: string; size: number; body: ReadableStream<Uint8Array> } | null,
		QueryFailed | BackupIncomplete | TransferFailed
	> {
		return this.backupWithDestination(id).andThen((row) => {
			if (!row) {
				return okAsync(null);
			}

			if (row.backup.status !== 'completed') {
				return errAsync(this.error(16005, 'BACKUP_INCOMPLETE'));
			}

			const { backup, destination } = row;
			const source = store(destination);

			return this.transfer(async () => {
				const files = await Promise.all(
					ARCHIVE_FILES.map(async (name) => {
						const object = await source.getObject(destination.bucket, `${backup.key}/${name}`);
						const size = Number(object?.headers.get('content-length'));

						if (!object?.body || Number.isNaN(size)) {
							throw new StepError(`${backup.key}/${name} is missing in the destination`);
						}

						return { name, size, body: object.body };
					})
				);

				const stamp = backup.startedAt
					.toISOString()
					.replace(/\.\d{3}Z$/, 'Z')
					.replace(/:/g, '-');

				return {
					filename: `pouchbase-backup-${stamp}.tar`,
					size: tarSize(files.map((file) => file.size)),
					body: archiveStream(files, backup.startedAt)
				};
			});
		});
	}

	/**
	 * Starts uploading a downloaded backup to a destination, with the manifest from its archive.
	 * Send the database files with `uploadPart`, then call `finishUpload`. Returns the backup id.
	 */
	startUpload(
		destinationId: string,
		manifest: unknown
	): ResultAsync<string, QueryFailed | DestinationNotFound | InvalidArchive> {
		const parsed = parseManifest(manifest);

		if (!parsed) {
			return errAsync(this.error(16010, 'INVALID_ARCHIVE'));
		}

		return this.destination(destinationId).andThen((destination) => {
			if (!destination) {
				return errAsync(this.error(16001, 'DESTINATION_NOT_FOUND'));
			}

			const id = crypto.randomUUID();
			const createdAt = new Date(parsed.createdAt);
			const state: BackupState = {
				step: 'upload',
				manifest: parsed,
				files: {},
				updatedAt: Date.now()
			};

			return this.query(() =>
				this.db.insert(backups).values({
					id,
					destinationId,
					key: backupKey(destination.prefix, createdAt),
					status: 'uploading',
					// Archives have no files; those are only restored from a destination.
					includeFiles: false,
					state: JSON.stringify(state),
					startedAt: createdAt
				})
			).map(() => id);
		});
	}

	/**
	 * Uploads part `part` (from 1, in order, at least 5 MiB except the last) of a database file of
	 * an upload. Part 1 starts the file over.
	 */
	uploadPart(
		id: string,
		file: DatabaseFile,
		part: number,
		body: Uint8Array<ArrayBuffer>,
		last: boolean
	): ResultAsync<void, QueryFailed | BackupNotFound | UploadNotActive | TransferFailed> {
		return this.upload(id).andThen(({ backup, destination, state }) => {
			const current = state.files[file];

			if (part !== 1 && (!current || current.done || current.etags.length !== part - 1)) {
				return errAsync(this.error(16011, 'UPLOAD_NOT_ACTIVE'));
			}

			const target = store(destination);
			const key = `${backup.key}/${file}`;

			return this.transfer(async () => {
				let entry = current;

				if (part === 1) {
					if (current && !current.done) {
						await target
							.abortMultipart(destination.bucket, key, current.uploadId)
							.catch(() => undefined);
					}

					entry = {
						uploadId: await target.startMultipart(destination.bucket, key, 'application/sql'),
						etags: [],
						size: 0,
						done: false
					};
				}

				if (!entry) {
					throw new StepError('The upload of this file was not started');
				}

				entry.etags.push(
					await target.uploadPart(destination.bucket, key, entry.uploadId, part, body)
				);
				entry.size += body.byteLength;

				if (last) {
					await target.completeMultipart(destination.bucket, key, entry.uploadId, entry.etags);
					entry.done = true;
				}

				await this.db
					.update(backups)
					.set({
						state: JSON.stringify({
							...state,
							files: { ...state.files, [file]: entry },
							updatedAt: Date.now()
						})
					})
					.where(eq(backups.id, backup.id));
			});
		});
	}

	/** Completes an upload once both database files are uploaded: it can be restored then. */
	finishUpload(
		id: string
	): ResultAsync<void, QueryFailed | BackupNotFound | UploadNotActive | TransferFailed> {
		return this.upload(id).andThen(({ backup, destination, state }) => {
			const files = DATABASE_FILES.map((file) => state.files[file]);

			if (files.some((file) => !file?.done)) {
				return errAsync(this.error(16011, 'UPLOAD_NOT_ACTIVE'));
			}

			const size = files.reduce((total, file) => total + (file?.size ?? 0), 0);
			const manifest: Manifest = { ...state.manifest, includeFiles: false, size, files: 0 };

			return this.transfer(async () => {
				await store(destination).putObject(
					destination.bucket,
					`${backup.key}/manifest.json`,
					new TextEncoder().encode(JSON.stringify(manifest, null, '\t')).buffer as ArrayBuffer,
					'application/json'
				);

				await this.db
					.update(backups)
					.set({
						status: 'completed',
						size,
						state: JSON.stringify({ step: 'finish' }),
						finishedAt: new Date()
					})
					.where(eq(backups.id, backup.id));
			});
		});
	}

	/**
	 * Replaces the system and app databases (and, with `includeFiles`, the uploaded files) with a
	 * backup; its steps run with `advance()`. Returns the id of the restore.
	 */
	restore(
		backupId: string,
		includeFiles: boolean
	): ResultAsync<string, QueryFailed | BackupNotFound | BackupIncomplete | JobRunning> {
		return this.query(() => this.db.select().from(backups).where(eq(backups.id, backupId)))
			.andThen(([backup]) => {
				if (!backup) {
					return errAsync(this.error(16004, 'BACKUP_NOT_FOUND'));
				}

				if (backup.status !== 'completed') {
					return errAsync(this.error(16005, 'BACKUP_INCOMPLETE'));
				}

				return this.running().andThen((running) =>
					running ? errAsync(this.error(16003, 'JOB_RUNNING')) : okAsync(backup)
				);
			})
			.andThen((backup) => {
				const id = crypto.randomUUID();
				const state: RestoreState = { step: 'app' };

				return this.query(() =>
					this.db.insert(backupRestores).values({
						id,
						backupId,
						includeFiles: includeFiles && backup.includeFiles,
						state: JSON.stringify(state)
					})
				).map(() => id);
			});
	}

	/**
	 * Adds the backups in a destination that aren't in the list yet, e.g. those of an earlier
	 * installation. Returns how many were added; call it again while it returns `DISCOVER_LIMIT`.
	 */
	discover(id: string): ResultAsync<number, QueryFailed | DestinationNotFound | DiscoverFailed> {
		return this.destination(id).andThen((destination) => {
			if (!destination) {
				return errAsync(this.error(16001, 'DESTINATION_NOT_FOUND'));
			}

			return fromPromise(this.importBackups(destination), (error): DiscoverFailed => ({
				...this.error(16007, 'DISCOVER_FAILED', error),
				data: { reason: reason(error) }
			}));
		});
	}

	/**
	 * Runs steps of the running backups and restores for up to `budget` milliseconds (always at least
	 * one step). Steps that fail are tried again later; a job fails after `MAX_ATTEMPTS` in a row.
	 * Returns whether jobs are still running.
	 */
	advance(budget: number): ResultAsync<{ running: boolean }, QueryFailed | StepsFailed> {
		return fromPromise(
			(async () => {
				const deadline = Date.now() + budget;
				const single = await this.singleStep();

				do {
					if (!(await this.runStep())) {
						break;
					}
				} while (!single && Date.now() < deadline);
			})(),
			(error) => this.error(16009, 'STEPS_FAILED', error)
		).andThen(() => this.running().map((running) => ({ running })));
	}

	/** Starts the scheduled backups that are due, then runs steps for up to `budget` milliseconds. */
	tick(budget: number): ResultAsync<{ running: boolean }, QueryFailed | StepsFailed> {
		const now = new Date();

		return this.query(() =>
			this.db
				.select()
				.from(backupSchedules)
				.where(and(eq(backupSchedules.enabled, true), lte(backupSchedules.nextRunAt, now)))
		)
			.andThen((due) =>
				fromPromise(
					(async () => {
						for (const schedule of due) {
							await this.startScheduled(schedule, now);
						}
					})(),
					(error) => this.error(16000, 'BACKUPS_QUERY_FAILED', error)
				)
			)
			.andThen(() => this.expireUploads())
			.andThen(() => this.retireDatabases())
			.andThen(() => this.advance(budget));
	}

	/** Whether a backup or restore is running. */
	running(): ResultAsync<boolean, QueryFailed> {
		return this.query(() =>
			Promise.all([
				this.db
					.select({ id: backups.id })
					.from(backups)
					.where(eq(backups.status, 'running'))
					.limit(1),
				this.db
					.select({ id: backupRestores.id })
					.from(backupRestores)
					.where(eq(backupRestores.status, 'running'))
					.limit(1)
			])
		).map(([running, restoring]) => running.length + restoring.length > 0);
	}

	/** Deletes the app databases that restores replaced, once no isolate uses them anymore. */
	private retireDatabases(): ResultAsync<void, QueryFailed> {
		return this.query(async () => {
			const rows = await this.db
				.select({ id: backupRestores.id, state: backupRestores.state })
				.from(backupRestores)
				.where(sql`${backupRestores.state} LIKE '%"retire"%'`);

			for (const row of rows) {
				const { retire, ...state } = parseState<RestoreState>(row.state, { step: 'done' });

				if (!retire || Date.now() - retire.at < RETIRE_AFTER) {
					continue;
				}

				// Never the database the app uses, e.g. after restoring an older backup.
				const current = await this.services.database().getApp();

				if (current.isOk() && current.value?.id !== retire.id) {
					const deleted = await this.services.database().delete(retire.id);

					if (deleted.isErr()) {
						console.warn(`[backups] could not delete the replaced app database ${retire.id}`);
						continue;
					}
				}

				await this.db
					.update(backupRestores)
					.set({ state: JSON.stringify(state) })
					.where(eq(backupRestores.id, row.id));
			}
		});
	}

	/** Uploads that stopped making progress fail, so they don't stay in the list as uploading. */
	private expireUploads(): ResultAsync<void, QueryFailed> {
		return this.query(async () => {
			const uploads = await this.db
				.select({ id: backups.id, state: backups.state })
				.from(backups)
				.where(eq(backups.status, 'uploading'));

			for (const upload of uploads) {
				const state = parseState<BackupState>(upload.state, { step: 'finish' });
				const updatedAt = state.step === 'upload' ? state.updatedAt : 0;

				if (Date.now() - updatedAt > UPLOAD_TIMEOUT) {
					await this.db
						.update(backups)
						.set({ status: 'failed', error: 'The upload was not finished', finishedAt: new Date() })
						.where(eq(backups.id, upload.id));
				}
			}
		});
	}

	private backupWithDestination(
		id: string
	): ResultAsync<{ backup: BackupRow; destination: Destination } | null, QueryFailed> {
		return this.query(() =>
			this.db
				.select({ backup: backups, destination: backupDestinations })
				.from(backups)
				.innerJoin(backupDestinations, eq(backupDestinations.id, backups.destinationId))
				.where(eq(backups.id, id))
		).map(([row]) => row ?? null);
	}

	/** A backup that is being uploaded, with its upload state. */
	private upload(
		id: string
	): ResultAsync<
		{ backup: BackupRow; destination: Destination; state: UploadState },
		QueryFailed | BackupNotFound | UploadNotActive
	> {
		return this.backupWithDestination(id).andThen((row) => {
			if (!row) {
				return errAsync(this.error(16004, 'BACKUP_NOT_FOUND'));
			}

			const state = parseState<BackupState>(row.backup.state, { step: 'finish' });

			if (row.backup.status !== 'uploading' || state.step !== 'upload') {
				return errAsync(this.error(16011, 'UPLOAD_NOT_ACTIVE'));
			}

			return okAsync({ ...row, state });
		});
	}

	private transfer<T>(run: () => Promise<T>): ResultAsync<T, TransferFailed> {
		return fromPromise(run(), (error): TransferFailed => ({
			...this.error(16012, 'TRANSFER_FAILED', error),
			data: { reason: reason(error) }
		}));
	}

	private restoring(): ResultAsync<boolean, QueryFailed> {
		return this.query(() =>
			this.db
				.select({ id: backupRestores.id })
				.from(backupRestores)
				.where(eq(backupRestores.status, 'running'))
				.limit(1)
		).map((rows) => rows.length > 0);
	}

	private destination(id: string): ResultAsync<Destination | null, QueryFailed> {
		return this.query(() =>
			this.db.select().from(backupDestinations).where(eq(backupDestinations.id, id))
		).map(([row]) => row ?? null);
	}

	private query<T>(run: () => Promise<T>): ResultAsync<T, QueryFailed> {
		return fromPromise(run(), (error) => this.error(16000, 'BACKUPS_QUERY_FAILED', error));
	}

	private testConnection(destination: Destination): ResultAsync<void, ConnectionFailed> {
		const driver = store(destination);
		const key = `${destination.prefix}/${CONNECTION_TEST_FILE}`;

		return fromPromise(
			(async () => {
				await driver.putObject(
					destination.bucket,
					key,
					new TextEncoder().encode('ok').buffer as ArrayBuffer,
					'text/plain'
				);
				await driver.deleteObject(destination.bucket, key);
			})(),
			(error): ConnectionFailed => ({
				...this.error(16002, 'CONNECTION_FAILED', error),
				data: { reason: reason(error) }
			})
		);
	}

	/** Free Workers allow few subrequests per invocation: one step each there. */
	private async singleStep() {
		if (typeof navigator === 'undefined' || navigator.userAgent !== 'Cloudflare-Workers') {
			return false;
		}

		const plan = await this.services.cloudflare().plan();

		return plan.isErr() || plan.value === 'free';
	}

	/** Unwraps the result of another service inside a step. */
	private async must<T>(result: ResultAsync<T, { message: string }>): Promise<T> {
		const value = await result;

		if (value.isErr()) {
			throw new StepError(value.error.message);
		}

		return value.value;
	}

	private async startScheduled(schedule: typeof backupSchedules.$inferSelect, now: Date) {
		const cron = parseCron(schedule.cron);
		const next = (cron && nextRun(cron, now)) ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);

		// Claims the run: an overlapping tick finds `next_run_at` changed and starts nothing.
		const claimed = await this.db
			.update(backupSchedules)
			.set({ nextRunAt: next, lastRunAt: now })
			.where(
				and(eq(backupSchedules.id, schedule.id), eq(backupSchedules.nextRunAt, schedule.nextRunAt))
			)
			.returning({ id: backupSchedules.id });

		if (!claimed.length) {
			return;
		}

		// Skipped while the previous one runs (or a restore does); the next run comes as planned.
		const [busy] = await this.db
			.select({ id: backups.id })
			.from(backups)
			.where(and(eq(backups.scheduleId, schedule.id), eq(backups.status, 'running')))
			.limit(1);

		if (busy) {
			return;
		}

		await this.must(this.start(schedule.destinationId, schedule.includeFiles, schedule.id)).catch(
			(error: unknown) => {
				console.warn(`[backups] scheduled backup not started: ${reason(error)}`);
			}
		);
	}

	/** Runs one step of a running restore, or else of a running backup. Returns whether it did. */
	private async runStep() {
		const now = new Date();
		const free = or(isNull(backups.lockedUntil), lt(backups.lockedUntil, now));
		const freeRestore = or(isNull(backupRestores.lockedUntil), lt(backupRestores.lockedUntil, now));
		const lockedUntil = new Date(now.getTime() + LOCK_MS);

		const [restore] = await this.db
			.update(backupRestores)
			.set({ lockedUntil })
			.where(
				eq(
					backupRestores.id,
					sql`(SELECT ${backupRestores.id} FROM ${backupRestores} WHERE ${backupRestores.status} = 'running' AND ${freeRestore} ORDER BY ${backupRestores.startedAt} LIMIT 1)`
				)
			)
			.returning();

		if (restore) {
			await this.runRestoreStep(restore);
			return true;
		}

		// No backups while a restore runs (it may be waiting for its lock).
		if (await this.must(this.restoring())) {
			return false;
		}

		const [backup] = await this.db
			.update(backups)
			.set({ lockedUntil })
			.where(
				eq(
					backups.id,
					sql`(SELECT ${backups.id} FROM ${backups} WHERE ${backups.status} = 'running' AND ${free} ORDER BY ${backups.startedAt} LIMIT 1)`
				)
			)
			.returning();

		if (backup) {
			await this.runBackupStep(backup);
			return true;
		}

		return false;
	}

	private async runBackupStep(backup: BackupRow) {
		const state = parseState<BackupState>(backup.state, {
			step: 'export',
			database: 'system',
			bookmark: null
		});

		try {
			const [destination] = await this.db
				.select()
				.from(backupDestinations)
				.where(eq(backupDestinations.id, backup.destinationId));

			if (!destination) {
				throw new StepError('The destination was deleted');
			}

			const result = await this.backupStep(backup, destination, state);

			await this.db
				.update(backups)
				.set({
					state: JSON.stringify(result.state ?? state),
					size: backup.size + (result.size ?? 0),
					files: backup.files + (result.files ?? 0),
					attempts: 0,
					error: null,
					lockedUntil: null,
					...(result.done && { status: 'completed' as const, finishedAt: new Date() })
				})
				.where(eq(backups.id, backup.id));
		} catch (error) {
			const attempts = backup.attempts + 1;
			const failed = attempts >= MAX_ATTEMPTS;

			console.warn(`[backups] backup ${backup.id} (${state.step}): ${reason(error)}`);

			await this.db
				.update(backups)
				.set({
					attempts,
					error: reason(error),
					lockedUntil: null,
					...(failed && { status: 'failed' as const, finishedAt: new Date() })
				})
				.where(eq(backups.id, backup.id));
		}
	}

	private async backupStep(
		backup: BackupRow,
		destination: Destination,
		state: BackupState
	): Promise<{ state?: BackupState; size?: number; files?: number; done?: boolean }> {
		const target = store(destination);

		if (state.step === 'export') {
			const databaseId =
				state.database === 'system'
					? await getDatabaseId()
					: (await this.must(this.services.database().requireApp())).id;

			if (!databaseId) {
				throw new StepError('The system database is missing');
			}

			let { bookmark } = state;
			let url: string | null = null;

			for (let poll = 0; poll < EXPORT_POLLS && !url; poll++) {
				if (poll > 0) {
					await sleep(2000);
				}

				({ bookmark, url } = await exportDatabase(databaseId, bookmark));
			}

			if (!url) {
				return { state: { ...state, bookmark } };
			}

			const download = await fetch(url);

			if (!download.ok || !download.body) {
				throw new StepError(`Downloading the export failed (${download.status})`);
			}

			const size = await target.putStream(
				destination.bucket,
				`${backup.key}/${state.database}.sql`,
				download.body,
				'application/sql'
			);

			if (state.database === 'system') {
				return { state: { step: 'export', database: 'app', bookmark: null }, size };
			}

			return {
				state: backup.includeFiles ? { step: 'files', cursor: null } : { step: 'finish' },
				size
			};
		}

		if (state.step === 'files') {
			return this.copyFiles(destination, target, state.cursor);
		}

		const manifest: Manifest = {
			format: MANIFEST_FORMAT,
			createdAt: backup.startedAt.toISOString(),
			includeFiles: backup.includeFiles,
			size: backup.size,
			files: backup.files
		};

		await target.putObject(
			destination.bucket,
			`${backup.key}/manifest.json`,
			new TextEncoder().encode(JSON.stringify(manifest, null, '\t')).buffer as ArrayBuffer,
			'application/json'
		);

		if (backup.scheduleId) {
			await this.prune(backup.scheduleId, destination);
		}

		return { done: true };
	}

	/** Copies the files that aren't in the destination yet, in the order of their ids. */
	private async copyFiles(
		destination: Destination,
		target: ObjectStore,
		cursor: string | null
	): Promise<{ state: BackupState; files: number }> {
		const scan = await this.must(this.services.files().scan(cursor, FILES_PER_STEP));
		const keys = scan.files.flatMap((file) => storageKeys(file));

		const copied = new Set(
			keys.length
				? (
						await this.db
							.select({ key: backupFiles.key })
							.from(backupFiles)
							.where(
								and(
									eq(backupFiles.destinationId, destination.id),
									sql`${backupFiles.key} IN (SELECT "value" FROM json_each(${JSON.stringify(keys)}))`
								)
							)
					).map(({ key }) => key)
				: []
		);

		const storage = this.services.storage();
		const written: string[] = [];
		let files = 0;
		let handled = 0;

		for (const file of scan.files) {
			const missing = storageKeys(file).filter((key) => !copied.has(key));

			if (written.length > 0 && written.length + missing.length > OBJECTS_PER_STEP) {
				break;
			}

			for (const key of missing) {
				const object = await this.must(storage.get(key));

				// Gone from the storage; nothing to back up.
				if (!object?.body) {
					continue;
				}

				await target.putStream(
					destination.bucket,
					`${destination.prefix}/files/${key}`,
					object.body,
					object.headers.get('content-type') ?? file.mimeType
				);
				written.push(key);
			}

			if (missing.length) {
				files++;
			}

			handled++;
		}

		if (written.length) {
			await this.db
				.insert(backupFiles)
				.values(written.map((key) => ({ destinationId: destination.id, key })))
				.onConflictDoNothing();
		}

		const finished = handled === scan.files.length && scan.files.length < FILES_PER_STEP;

		return {
			state: finished
				? { step: 'finish' }
				: { step: 'files', cursor: scan.files[handled - 1]?.id ?? cursor },
			files
		};
	}

	/** Deletes the oldest backups of a schedule beyond the number it keeps. */
	private async prune(scheduleId: string, destination: Destination) {
		const [schedule] = await this.db
			.select({ keep: backupSchedules.keep })
			.from(backupSchedules)
			.where(eq(backupSchedules.id, scheduleId));

		if (!schedule || schedule.keep === 0) {
			return;
		}

		const old = await this.db
			.select()
			.from(backups)
			.where(and(eq(backups.scheduleId, scheduleId), eq(backups.status, 'completed')))
			.orderBy(desc(backups.startedAt))
			.limit(PRUNE_PER_STEP)
			// The backup that just finished is still `running`, so it counts as one of `keep`.
			.offset(Math.max(0, schedule.keep - 1));

		for (const backup of old) {
			await this.removeBackup(backup, destination);
		}
	}

	private async removeBackup(backup: BackupRow, destination: Destination) {
		const target = store(destination);
		const state = parseState<BackupState>(backup.state, { step: 'finish' });

		// An unfinished upload keeps its parts in the bucket until it is aborted.
		if (state.step === 'upload') {
			for (const [file, upload] of Object.entries(state.files)) {
				if (upload && !upload.done) {
					await target
						.abortMultipart(destination.bucket, `${backup.key}/${file}`, upload.uploadId)
						.catch(() => undefined);
				}
			}
		}

		await Promise.all(
			['system.sql', 'app.sql', 'manifest.json'].map((file) =>
				target.deleteObject(destination.bucket, `${backup.key}/${file}`)
			)
		);
		await this.db.delete(backups).where(eq(backups.id, backup.id));
	}

	private async importBackups(destination: Destination) {
		const target = store(destination);
		const folders = await target.listFolders(destination.bucket, `${destination.prefix}/`);
		const known = new Set(
			(
				await this.db
					.select({ key: backups.key })
					.from(backups)
					.where(eq(backups.destinationId, destination.id))
			).map(({ key }) => key)
		);

		const candidates = folders
			.map((folder) => folder.replace(/\/$/, ''))
			.filter((key) => key !== `${destination.prefix}/files` && !known.has(key))
			.slice(0, DISCOVER_LIMIT);

		let added = 0;

		for (const key of candidates) {
			const object = await target.getObject(destination.bucket, `${key}/manifest.json`);
			const manifest = object ? ((await object.json().catch(() => null)) as Manifest | null) : null;

			// Not a (finished) backup.
			if (!manifest || manifest.format !== MANIFEST_FORMAT || !Date.parse(manifest.createdAt)) {
				continue;
			}

			await this.db.insert(backups).values({
				destinationId: destination.id,
				key,
				status: 'completed',
				includeFiles: !!manifest.includeFiles,
				size: Number(manifest.size) || 0,
				files: Number(manifest.files) || 0,
				state: JSON.stringify({ step: 'finish' }),
				startedAt: new Date(manifest.createdAt),
				finishedAt: new Date(manifest.createdAt)
			});
			added++;
		}

		return added;
	}

	private async runRestoreStep(restore: RestoreRow) {
		const state = parseState<RestoreState>(restore.state, { step: 'app' });

		try {
			const [row] = restore.backupId
				? await this.db
						.select({ backup: backups, destination: backupDestinations })
						.from(backups)
						.innerJoin(backupDestinations, eq(backupDestinations.id, backups.destinationId))
						.where(eq(backups.id, restore.backupId))
				: [];

			if (!row) {
				throw new StepError('The backup was deleted');
			}

			const result = await this.restoreStep(restore, row.backup, row.destination, state);

			// The system step saved its own progress, inside the restored database.
			if (!result) {
				return;
			}

			await this.db
				.update(backupRestores)
				.set({
					state: JSON.stringify({ ...(result.state ?? state), retire: state.retire }),
					files: restore.files + (result.files ?? 0),
					attempts: 0,
					error: null,
					lockedUntil: null,
					...(result.done && { status: 'completed' as const, finishedAt: new Date() })
				})
				.where(eq(backupRestores.id, restore.id));
		} catch (error) {
			const attempts = restore.attempts + 1;
			const failed = attempts >= MAX_ATTEMPTS;

			console.warn(`[backups] restore ${restore.id} (${state.step}): ${reason(error)}`);

			if (failed && 'database' in state) {
				await this.discardSpare(state.database);
			}

			await this.db
				.update(backupRestores)
				.set({
					attempts,
					error: reason(error),
					lockedUntil: null,
					...(failed && { status: 'failed' as const, finishedAt: new Date() })
				})
				.where(eq(backupRestores.id, restore.id));
		}
	}

	private async restoreStep(
		restore: RestoreRow,
		backup: BackupRow,
		destination: Destination,
		state: RestoreState
	): Promise<{ state?: RestoreState; files?: number; done?: boolean } | null> {
		const source = store(destination);

		if (state.step === 'app') {
			// Both dumps must be there before anything changes.
			const [system, app] = await Promise.all(
				['system.sql', 'app.sql'].map((file) =>
					source.getRange(destination.bucket, `${backup.key}/${file}`, 0, 1)
				)
			);

			if (!system || !app) {
				throw new StepError(`The backup in ${backup.key} is incomplete`);
			}

			const database = await this.must(this.services.database().createSpare());

			return {
				state:
					app.size <= IMPORT_LIMIT
						? { step: 'import', database, bookmark: null }
						: { step: 'load', database, offset: 0, size: app.size }
			};
		}

		if (state.step === 'import') {
			const progress = state.bookmark
				? await pollDatabaseImport(state.database.id, state.bookmark)
				: await importDatabase(
						state.database.id,
						await this.download(source, destination, `${backup.key}/app.sql`)
					);

			return {
				state: progress.done
					? { step: 'system', database: state.database }
					: { ...state, bookmark: progress.bookmark }
			};
		}

		if (state.step === 'load') {
			return { state: await this.loadChunk(restore, backup, destination, source, state) };
		}

		if (state.step === 'system') {
			await this.restoreSystem(restore, backup, destination, source, state.database);
			return null;
		}

		if (state.step === 'files') {
			return this.restoreFiles(destination, source, state.cursor);
		}

		return { done: true };
	}

	/**
	 * Runs the statements in the next chunk of a large app dump on the spare database, in batches.
	 * The offset is saved after every batch, so a retry never runs a statement twice.
	 */
	private async loadChunk(
		restore: RestoreRow,
		backup: BackupRow,
		destination: Destination,
		source: ObjectStore,
		state: Extract<RestoreState, { step: 'load' }>
	): Promise<RestoreState> {
		const chunk = await source.getRange(
			destination.bucket,
			`${backup.key}/app.sql`,
			state.offset,
			state.offset + LOAD_CHUNK
		);

		if (!chunk) {
			throw new StepError(`${backup.key}/app.sql is missing in the destination`);
		}

		const final = state.offset + chunk.bytes.byteLength >= chunk.size;
		const { statements } = splitStatements(chunk.bytes, final);

		if (!statements.length && !final) {
			throw new StepError('app.sql has a statement larger than 2 MB, which D1 can’t run');
		}

		let offset = state.offset;
		let batch: typeof statements = [];
		let bytes = 0;

		const flush = async () => {
			if (!batch.length) {
				return;
			}

			await batchDatabase(
				state.database.id,
				batch.map((statement) => ({ sql: statement.sql }))
			);

			offset = state.offset + batch[batch.length - 1].end;
			batch = [];
			bytes = 0;

			await this.db
				.update(backupRestores)
				.set({ state: JSON.stringify({ ...state, offset, size: chunk.size }) })
				.where(eq(backupRestores.id, restore.id));
		};

		for (const statement of statements) {
			// D1 runs these itself; foreign keys are checked per batch otherwise.
			if (/^PRAGMA\s+defer_foreign_keys/i.test(statement.sql)) {
				continue;
			}

			if (batch.length >= BATCH_STATEMENTS || bytes + statement.sql.length > BATCH_BYTES) {
				await flush();
			}

			batch.push(statement);
			bytes += statement.sql.length;
		}

		await flush();

		if (final) {
			return { step: 'system', database: state.database };
		}

		return { ...state, offset: state.offset + (statements.at(-1)?.end ?? 0), size: chunk.size };
	}

	/** Deletes the spare database of a failed restore, unless the app already switched to it. */
	private async discardSpare(database: SpareDatabase) {
		const current = await this.services.database().getApp();

		if (current.isOk() && current.value && current.value.id !== database.id) {
			await this.services.database().delete(database.id);
		}
	}

	/**
	 * Replaces the system database in one import: the dump, then the preserved tables and settings
	 * as they are now (see `PRESERVED_TABLES`), pointing at the spare database as the app database.
	 * The restore's own row is written in its next state, so the restored database continues where
	 * this step ends.
	 */
	private async restoreSystem(
		restore: RestoreRow,
		backup: BackupRow,
		destination: Destination,
		source: ObjectStore,
		database: SpareDatabase
	) {
		const systemId = await getDatabaseId();

		if (!systemId) {
			throw new StepError('The system database is missing');
		}

		const dump = await this.download(source, destination, `${backup.key}/system.sql`);
		const replaced = await this.must(this.services.database().requireApp());
		const retire = { id: replaced.id, at: Date.now() };
		const next: RestoreState = restore.includeFiles
			? { step: 'files', cursor: null, retire }
			: { step: 'done', retire };
		const done = !restore.includeFiles;
		const statements: string[] = [];

		for (const table of [...PRESERVED_TABLES].reverse()) {
			statements.push(`DELETE FROM ${identifier(table)};`);
		}

		for (const table of PRESERVED_TABLES) {
			for (const row of await queryObjects(systemId, `SELECT * FROM ${identifier(table)}`)) {
				if (table === 'backup_restores' && row.id === restore.id) {
					Object.assign(row, {
						state: JSON.stringify(next),
						attempts: 0,
						error: null,
						locked_until: null,
						...(done && { status: 'completed', finished_at: Date.now() })
					});
				}

				if (table === 'sessions') {
					// Sessions of admins that don't exist in the backup are dropped.
					const columns = Object.keys(row);

					statements.push(
						`INSERT INTO "sessions" (${columns.map(identifier).join(', ')}) SELECT ${columns
							.map((column) => literal(row[column]))
							.join(
								', '
							)} WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = ${literal(row.user_id)});`
					);
					continue;
				}

				statements.push(insertStatement(table, row));
			}
		}

		const [bucket] = await this.db
			.select()
			.from(settings)
			.where(eq(settings.key, 'files_bucket_name'));

		statements.push(
			`DELETE FROM "settings" WHERE "key" IN (${PRESERVED_SETTINGS.map(literal).join(', ')});`,
			insertStatement('settings', { key: 'app_database_id', value: database.id }),
			insertStatement('settings', { key: 'app_database_name', value: database.name }),
			...(bucket ? [insertStatement('settings', bucket)] : [])
		);

		let progress = await importDatabase(
			systemId,
			encode(
				'PRAGMA defer_foreign_keys = true;\n',
				(await dropStatements(systemId)).join('\n'),
				'\n',
				dump,
				'\n',
				statements.join('\n'),
				'\n'
			)
		);

		const deadline = Date.now() + SYSTEM_IMPORT_TIMEOUT;

		while (!progress.done) {
			if (Date.now() > deadline) {
				throw new StepError('Restoring the system database takes longer than expected');
			}

			await sleep(1000);
			progress = await pollDatabaseImport(systemId, progress.bookmark);
		}

		// The restored database may be older than this version, and the files collection may differ.
		// `remigrate` also makes this isolate use the new app database right away.
		forgetFilesCollection();
		await this.must(this.services.database().remigrate());
	}

	/** Copies the files of the restored app database back from the destination. */
	private async restoreFiles(
		destination: Destination,
		source: ObjectStore,
		cursor: string | null
	): Promise<{ state: RestoreState; files: number; done?: boolean }> {
		const scan = await this.must(this.services.files().scan(cursor, OBJECTS_PER_STEP));
		const storage = this.services.storage();
		let objects = 0;
		let handled = 0;
		let files = 0;

		for (const file of scan.files) {
			const keys = storageKeys(file);

			if (handled > 0 && objects + keys.length > OBJECTS_PER_STEP) {
				break;
			}

			let restored = false;

			for (const key of keys) {
				const object = await source.getObject(
					destination.bucket,
					`${destination.prefix}/files/${key}`
				);

				// Not in the backup (e.g. a thumbnail made after the last backup); it's made again when needed.
				if (!object) {
					continue;
				}

				await this.must(
					storage.put(
						key,
						await object.arrayBuffer(),
						object.headers.get('content-type') ?? file.mimeType
					)
				);
				restored = true;
			}

			objects += keys.length;
			handled++;

			if (restored) {
				files++;
			}
		}

		const finished = handled === scan.files.length && scan.files.length < OBJECTS_PER_STEP;

		return {
			state: { step: 'files', cursor: scan.files[handled - 1]?.id ?? cursor },
			files,
			done: finished
		};
	}

	private async download(source: ObjectStore, destination: Destination, key: string) {
		const object = await source.getObject(destination.bucket, key);

		if (!object) {
			throw new StepError(`${key} is missing in the destination`);
		}

		return new Uint8Array(await object.arrayBuffer());
	}
}
