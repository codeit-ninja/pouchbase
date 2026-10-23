import type { FieldOptions, FieldType } from '../../fields/field-types';
import type { CollectionSettings } from '../../files/thumbnails';
import type { PluginManifest } from '@pouchbasejs/plugin-sdk';

import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	username: text('username').notNull().unique(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessions = sqliteTable('sessions', {
	/** SHA-256 hash of the token stored in the cookie. */
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/** Collections of the app; each one is a table in the app database. */
export const collections = sqliteTable('collections', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	/** Also the table name in the app database. */
	name: text('name').notNull().unique(),
	/** Built-in collections (like `users`) can't be renamed or deleted. */
	system: integer('system', { mode: 'boolean' }).notNull().default(false),
	/** Collection-specific settings, e.g. thumbnail sizes for `files`. */
	settings: text('settings', { mode: 'json' }).$type<CollectionSettings>().notNull().default({}),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Fields (columns) of a collection. */
export const fields = sqliteTable(
	'fields',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		collectionId: text('collection_id')
			.notNull()
			.references(() => collections.id, { onDelete: 'cascade' }),
		/** Also the column name in the collection's table. */
		name: text('name').notNull(),
		type: text('type').$type<FieldType>().notNull(),
		required: integer('required', { mode: 'boolean' }).notNull().default(false),
		unique: integer('unique', { mode: 'boolean' }).notNull().default(false),
		/** Default value as entered in the form; the column DEFAULT is derived from it. */
		defaultValue: text('default_value'),
		options: text('options', { mode: 'json' }).$type<FieldOptions>().notNull().default({}),
		/** Fields of built-in collections (like `users.email`) can't be renamed or deleted. */
		system: integer('system', { mode: 'boolean' }).notNull().default(false),
		/** Display order within the collection; ties (e.g. fields from before ordering) by `createdAt`. */
		position: integer('position').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('fields_collection_name_unique').on(table.collectionId, table.name)]
);

/** OAuth providers app users can sign in with. */
export const oauthProviders = sqliteTable('oauth_providers', {
	/** Provider key, e.g. `github`. */
	provider: text('provider').primaryKey(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
	clientId: text('client_id').notNull().default(''),
	clientSecret: text('client_secret').notNull().default(''),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/**
 * A pending OAuth sign-in of an app user (popup flow). The app proves it started
 * the sign-in with its own PKCE verifier before it receives the token.
 */
export const oauthRequests = sqliteTable('oauth_requests', {
	/** `state` sent to the provider. */
	id: text('id').primaryKey(),
	provider: text('provider').notNull(),
	/** State chosen by the app; it polls for the result with it. */
	clientState: text('client_state').notNull().unique(),
	/** S256 challenge of the app's verifier. */
	clientChallenge: text('client_challenge').notNull(),
	/** PKCE verifier between Pouchbase and the provider. */
	providerVerifier: text('provider_verifier').notNull(),
	status: text('status', { enum: ['pending', 'done', 'error'] })
		.notNull()
		.default('pending'),
	token: text('token'),
	userId: text('user_id'),
	error: text('error'),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

/** S3-compatible buckets that backups are written to. */
export const backupDestinations = sqliteTable('backup_destinations', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	endpoint: text('endpoint').notNull(),
	region: text('region').notNull(),
	bucket: text('bucket').notNull(),
	accessKeyId: text('access_key_id').notNull(),
	secretAccessKey: text('secret_access_key').notNull(),
	/** `https://host/bucket/key` instead of `https://bucket.host/key`. */
	pathStyle: integer('path_style', { mode: 'boolean' }).notNull().default(false),
	/** Folder in the bucket that holds the backups, without slashes at the ends. */
	prefix: text('prefix').notNull().default('pouchbase'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Backups that run on a cron schedule (UTC). */
export const backupSchedules = sqliteTable('backup_schedules', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	destinationId: text('destination_id')
		.notNull()
		.references(() => backupDestinations.id, { onDelete: 'cascade' }),
	/** Five-field cron expression, e.g. `0 3 * * *`. */
	cron: text('cron').notNull(),
	includeFiles: integer('include_files', { mode: 'boolean' }).notNull().default(false),
	/** How many backups of this schedule are kept; older ones are deleted. 0 keeps all. */
	keep: integer('keep').notNull().default(7),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }).notNull(),
	lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Backups, running or done. The SQL dumps live in the destination under `key`. */
export const backups = sqliteTable('backups', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	destinationId: text('destination_id')
		.notNull()
		.references(() => backupDestinations.id, { onDelete: 'cascade' }),
	scheduleId: text('schedule_id').references(() => backupSchedules.id, { onDelete: 'set null' }),
	/** Folder of this backup in the destination, e.g. `pouchbase/2026-10-23T03-00-00Z-k3x9`. */
	key: text('key').notNull(),
	/** `uploading`: an archive is being uploaded from the Backups page. */
	status: text('status', { enum: ['running', 'uploading', 'completed', 'failed'] })
		.notNull()
		.default('running'),
	includeFiles: integer('include_files', { mode: 'boolean' }).notNull().default(false),
	/** Bytes of the SQL dumps. */
	size: integer('size').notNull().default(0),
	/** Files copied to the destination by this backup (unchanged files are copied only once). */
	files: integer('files').notNull().default(0),
	/** JSON: the step the backup is at (see `BackupsService`). */
	state: text('state').notNull().default('{}'),
	error: text('error'),
	/** Consecutive failed attempts of the current step. */
	attempts: integer('attempts').notNull().default(0),
	/** A step is running until then; keeps two requests from running the same backup. */
	lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
	startedAt: integer('started_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	finishedAt: integer('finished_at', { mode: 'timestamp_ms' })
});

/** Restores of a backup, running or done. */
export const backupRestores = sqliteTable('backup_restores', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	backupId: text('backup_id').references(() => backups.id, { onDelete: 'set null' }),
	status: text('status', { enum: ['running', 'completed', 'failed'] })
		.notNull()
		.default('running'),
	includeFiles: integer('include_files', { mode: 'boolean' }).notNull().default(false),
	files: integer('files').notNull().default(0),
	state: text('state').notNull().default('{}'),
	error: text('error'),
	attempts: integer('attempts').notNull().default(0),
	lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
	startedAt: integer('started_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	finishedAt: integer('finished_at', { mode: 'timestamp_ms' })
});

/**
 * Storage keys of files (and thumbnails) already copied to a destination. Uploaded files never
 * change, so every backup only copies the new ones.
 */
export const backupFiles = sqliteTable(
	'backup_files',
	{
		destinationId: text('destination_id')
			.notNull()
			.references(() => backupDestinations.id, { onDelete: 'cascade' }),
		key: text('key').notNull()
	},
	(table) => [uniqueIndex('backup_files_destination_key_unique').on(table.destinationId, table.key)]
);

/** Serverless functions: code that runs as a Worker of its own, called through `/api/functions/<name>`. */
export const functions = sqliteTable('functions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	/** Part of the URL and of the Worker's name: lowercase letters, digits and dashes. */
	name: text('name').notNull().unique(),
	description: text('description').notNull().default(''),
	/** Only callers with a valid token of an app user can call the function. */
	requireAuth: integer('require_auth', { mode: 'boolean' }).notNull().default(false),
	/**
	 * Shared with the Worker as a secret: the Worker only answers requests that carry it, so its
	 * workers.dev URL can't be called directly.
	 */
	secret: text('secret').notNull(),
	/** The Worker's workers.dev URL, once deployed. */
	url: text('url'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Every deploy of a function; the highest number is the code that runs. */
export const functionVersions = sqliteTable(
	'function_versions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		functionId: text('function_id')
			.notNull()
			.references(() => functions.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(),
		language: text('language', { enum: ['javascript', 'typescript'] }).notNull(),
		/** The code as written or uploaded. */
		source: text('source').notNull(),
		/** The JavaScript compiled from TypeScript that was deployed; `null` for JavaScript. */
		compiled: text('compiled'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('function_versions_function_number_unique').on(table.functionId, table.number)
	]
);

/** Plugins installed from a plugin registry; one row per plugin, holding the installed version. */
export const plugins = sqliteTable('plugins', {
	/** The plugin's id in the registry and its manifest. */
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	version: text('version').notNull(),
	apiVersion: integer('api_version').notNull(),
	manifest: text('manifest', { mode: 'json' }).$type<PluginManifest>().notNull(),
	/** The bundle as downloaded (JSON, at most `MAX_BUNDLE_SIZE`); checked against `integrity`. */
	bundle: text('bundle').notNull(),
	integrity: text('integrity').notNull(),
	/** The registry it was installed from, for updates. */
	registryUrl: text('registry_url').notNull(),
	installedAt: integer('installed_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export type User = typeof users.$inferSelect;
