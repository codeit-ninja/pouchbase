import type { UsageRange } from '#lib/cloudflare/limits.js';
import type {
	CloudflareResources,
	LimitTotals,
	UsageSeries,
	WorkerInfo
} from '#lib/cloudflare/types.js';

/**
 * The platform drivers: where the databases and the uploaded files live. Pouchbase stores its data
 * on Cloudflare (D1 and R2 through the REST API) on every runtime. Drivers are infrastructure: they
 * throw, services wrap them in results.
 */

export type DatabaseInfo = {
	/** Platform-specific id, stored in the settings for the app database. */
	id: string;
	name: string;
};

export type QueryResult = {
	columns: string[];
	/** One array per row, in the order of `columns` (the D1 `/raw` format). */
	rows: unknown[][];
};

export type Statement = {
	sql: string;
	params?: unknown[];
};

export interface DatabaseDriver {
	/** The database with this name, or `null` when it doesn't exist. */
	find(name: string): Promise<DatabaseInfo | null>;
	create(name: string): Promise<DatabaseInfo>;
	/** Deleting a database that doesn't exist is not an error. */
	delete(databaseId: string): Promise<void>;
	/** Runs a single statement with positional (`?`) parameters. */
	query(databaseId: string, sql: string, params?: unknown[]): Promise<QueryResult>;
	/**
	 * Runs several statements in one round-trip, in order, and returns one result per statement.
	 * Whether they form a transaction depends on the driver: use it to save round-trips, not for
	 * atomicity.
	 */
	batch(databaseId: string, statements: Statement[]): Promise<QueryResult[]>;
	/**
	 * Makes these databases faster to reach where the platform supports it (Cloudflare: D1 bindings
	 * on the deployed Worker). Optional; queries work without it.
	 */
	attach?(databaseIds: string[]): Promise<void>;
	/**
	 * How queries on this database are sent right now, for the timing logs (Cloudflare: `binding`
	 * or `api`). Optional.
	 */
	route?(databaseId: string): string;
	/**
	 * Starts an export of the whole database as a SQL dump, or checks on the export that returned
	 * `bookmark`. `url` is a download link (valid for an hour) once the dump is ready.
	 */
	exportSql(databaseId: string, bookmark: string | null): Promise<SqlExport>;
	/**
	 * Starts running a SQL file on the database as one transaction: when a statement fails, nothing
	 * changes. The database doesn't answer queries until it is done.
	 */
	importSql(databaseId: string, sql: Uint8Array<ArrayBuffer>): Promise<SqlImport>;
	/** Checks on the import that returned `bookmark`; throws when it failed. */
	pollImport(databaseId: string, bookmark: string): Promise<SqlImport>;
}

export type SqlExport = { bookmark: string; url: string | null };

export type SqlImport = { bookmark: string; done: boolean };

export interface StorageDriver {
	bucketExists(name: string): Promise<boolean>;
	createBucket(name: string): Promise<void>;
	putObject(bucket: string, key: string, body: ArrayBuffer, contentType: string): Promise<void>;
	/**
	 * The object as a streaming `Response` with `Content-Type` and `Content-Length` headers, or
	 * `null` when it doesn't exist.
	 */
	getObject(bucket: string, key: string): Promise<Response | null>;
	/** Deleting an object that doesn't exist is not an error. */
	deleteObject(bucket: string, key: string): Promise<void>;
}

/** An S3-compatible bucket, with what backups need on top of the usual object storage. */
export interface ObjectStore extends StorageDriver {
	/**
	 * Uploads a stream of unknown length, in parts when it is large, without holding more than one
	 * part in memory. Returns the number of bytes written.
	 */
	putStream(
		bucket: string,
		key: string,
		body: ReadableStream<Uint8Array>,
		contentType: string
	): Promise<number>;
	/**
	 * Bytes `start` up to (not including) `end` of an object, and the size of the whole object;
	 * fewer bytes at its end. `null` when the object doesn't exist.
	 */
	getRange(
		bucket: string,
		key: string,
		start: number,
		end: number
	): Promise<{ bytes: Uint8Array<ArrayBuffer>; size: number } | null>;
	/**
	 * A multipart upload over several requests: start it, upload numbered parts (at least 5 MiB
	 * each, except the last) and complete it with their ETags in order, or abort it.
	 */
	startMultipart(bucket: string, key: string, contentType: string): Promise<string>;
	/** Uploads part `number` (from 1) and returns its ETag. */
	uploadPart(
		bucket: string,
		key: string,
		uploadId: string,
		number: number,
		body: Uint8Array<ArrayBuffer>
	): Promise<string>;
	completeMultipart(bucket: string, key: string, uploadId: string, etags: string[]): Promise<void>;
	/** Aborting an upload that doesn't exist (anymore) is not an error. */
	abortMultipart(bucket: string, key: string, uploadId: string): Promise<void>;
	/** The folders directly below `prefix` (S3 common prefixes, ending in `/`), at most 1000. */
	listFolders(bucket: string, prefix: string): Promise<string[]>;
}

/** What the insights driver needs to tell this installation's resources from the rest of the account. */
export type InsightsInput = {
	systemDatabase: DatabaseInfo | null;
	appDatabase: DatabaseInfo | null;
	bucketName: string | null;
};

/**
 * Insight into the account the app runs on, for the dashboard: resources, the Worker's bindings and
 * usage metrics. Only Cloudflare provides one; on other platforms `insights` is `null`.
 */
export interface InsightsDriver {
	resources(input: InsightsInput): Promise<CloudflareResources>;
	/** The deployed Worker, or `null` when it isn't deployed (yet). */
	worker(): Promise<WorkerInfo | null>;
	usage(range: UsageRange, input: InsightsInput): Promise<UsageSeries>;
	limitTotals(): Promise<LimitTotals>;
}

/** An error reported by the platform (e.g. the Cloudflare API), with the details it gave. */
export class PlatformError extends Error {
	constructor(
		readonly status: number,
		readonly errors: { code: number; message: string }[],
		source = 'Platform'
	) {
		super(
			`${source} (${status}): ${errors.map((e) => `[${e.code}] ${e.message}`).join(', ') || 'unknown error'}`
		);
	}
}

/** A JavaScript module of a function Worker. */
export type FunctionModule = { name: string; content: string };

/** What a function Worker gets in `env`, besides the secrets set through `putSecret`. */
export type FunctionBinding =
	| { type: 'plain_text'; name: string; text: string }
	| { type: 'secret_text'; name: string; text: string };

export type FunctionUpload = {
	/** Name of the module in `modules` that exports the `fetch` handler. */
	mainModule: string;
	modules: FunctionModule[];
	bindings: FunctionBinding[];
	/** Shown with the version on the platform, e.g. `Pouchbase version 3`. */
	message: string;
};

/** A log line of a function Worker: `console.*` output, an uncaught error or a request. */
export type FunctionLog = {
	id: string;
	/** Milliseconds since 1970. */
	timestamp: number;
	level: 'debug' | 'info' | 'log' | 'warn' | 'error';
	message: string;
	/** Lines of the same request share this id. */
	requestId: string | null;
};

/**
 * Functions: user code deployed as separate Workers, one per function, next to the app. Only
 * Cloudflare runs them; the app reaches them over their workers.dev URL, from Workers and Node.
 */
export interface FunctionsDriver {
	/** The account's workers.dev subdomain (`<subdomain>.workers.dev`), or `null` when it has none. */
	subdomain(): Promise<string | null>;
	/**
	 * Uploads the code as a new version and deploys it right away, creating the Worker when it doesn't
	 * exist. Secrets of the previous version are kept.
	 */
	deploy(script: string, upload: FunctionUpload): Promise<void>;
	/** Serves the Worker on its workers.dev URL (without preview URLs). */
	enableSubdomain(script: string): Promise<void>;
	/** Deleting a Worker that doesn't exist is not an error. */
	delete(script: string): Promise<void>;
	/** Names of the Worker's secrets; values can't be read back. */
	secrets(script: string): Promise<string[]>;
	/** Adds or replaces a secret, which deploys a new version with it. */
	putSecret(script: string, name: string, value: string): Promise<void>;
	/** Deleting a secret that doesn't exist is not an error. */
	deleteSecret(script: string, name: string): Promise<void>;
	/** The most recent log lines since `since` (milliseconds since 1970), newest first. */
	logs(script: string, since: number): Promise<FunctionLog[]>;
}
