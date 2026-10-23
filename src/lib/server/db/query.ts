import type { QueryResult, Statement } from '../platform';

import { POUCHBASE_LOG_TIMING } from '$app/env/private';

import { database } from '../platform';

/**
 * Raw queries on the platform's databases (see `../platform`).
 *
 * - `pouchbase`: the system database (users, sessions, settings), queried via `rawQuery`.
 * - the app database: holds the data of the app built on Pouchbase.
 *   It gets a random name; its id and name are stored in the system database's settings.
 */

export const DATABASE_NAME = 'pouchbase';

/** The database does not exist (yet), so the installation has not run. */
export class DatabaseMissingError extends Error {
	constructor() {
		super(`Database "${DATABASE_NAME}" does not exist`);
	}
}

// Cached per isolate so we don't look up the id for every query.
let databaseId: string | undefined;

/** Creates a new database with the given name. */
export function createDatabase(name: string) {
	return database.create(name);
}

/** Returns the system database id, or `null` if it does not exist yet. */
export async function getDatabaseId() {
	databaseId ??= (await timed('find database', () => database.find(DATABASE_NAME)))?.id;
	return databaseId ?? null;
}

/** Deletes a database (not the system database). */
export function deleteDatabase(databaseId: string) {
	return database.delete(databaseId);
}

/** Lets the platform connect these databases more directly (see `DatabaseDriver.attach`). */
export async function attachDatabases(databaseIds: string[]) {
	await database.attach?.(databaseIds);
}

/** Looks up the system database and creates it if it does not exist yet. */
export async function ensureDatabase() {
	databaseId = (await getDatabaseId()) ?? (await createDatabase(DATABASE_NAME)).id;
	return databaseId;
}

/** Logs how long a database round-trip takes when `POUCHBASE_LOG_TIMING` is on. */
async function timed<T>(label: string, run: () => Promise<T>) {
	if (!POUCHBASE_LOG_TIMING) {
		return run();
	}

	const start = performance.now();

	try {
		return await run();
	} finally {
		console.log(
			`[db] ${Math.round(performance.now() - start)}ms ${label.replace(/\s+/g, ' ').slice(0, 120)}`
		);
	}
}

/** Prefixes a timing label with how the query is sent (e.g. `binding` or `api`), if known. */
function routed(databaseId: string, label: string) {
	const route = POUCHBASE_LOG_TIMING ? database.route?.(databaseId) : undefined;

	return route ? `${route} ${label}` : label;
}

function runQuery(databaseId: string, sql: string, params: unknown[]): Promise<QueryResult> {
	return timed(routed(databaseId, sql), () => database.query(databaseId, sql, params));
}

function runBatch(databaseId: string, statements: Statement[]): Promise<QueryResult[]> {
	return timed(
		routed(
			databaseId,
			`batch(${statements.length}) ${statements.map(({ sql }) => sql).join(' | ')}`
		),
		() => database.batch(databaseId, statements)
	);
}

/** Runs a single statement on any database and returns the rows as arrays. */
export async function queryDatabase(databaseId: string, sql: string, params: unknown[] = []) {
	return (await runQuery(databaseId, sql, params)).rows;
}

/**
 * Runs several statements on any database in one round-trip and returns the rows of each, as
 * arrays. Not a transaction.
 */
export async function batchDatabase(databaseId: string, statements: Statement[]) {
	return (await runBatch(databaseId, statements)).map((result) => result.rows);
}

/** Like `queryDatabase`, but returns each row as an object keyed by column name. */
export async function queryObjects(databaseId: string, sql: string, params: unknown[] = []) {
	const { columns, rows } = await runQuery(databaseId, sql, params);

	return rows.map(
		(row) =>
			Object.fromEntries(columns.map((column, index) => [column, row[index]])) as Record<
				string,
				unknown
			>
	);
}

/** Whether a table exists in a database. */
export async function tableExists(databaseId: string, name: string) {
	const rows = await queryDatabase(
		databaseId,
		`SELECT 1 FROM sqlite_master WHERE "type" = 'table' AND "name" = ?`,
		[name]
	);

	return rows.length > 0;
}

async function requireDatabaseId() {
	const id = await getDatabaseId();

	if (!id) {
		throw new DatabaseMissingError();
	}

	return id;
}

/** Runs a single statement on the system database. */
export async function rawQuery(sql: string, params: unknown[] = []) {
	return queryDatabase(await requireDatabaseId(), sql, params);
}

/** Runs several statements on the system database in one round-trip (see `batchDatabase`). */
export async function rawBatch(statements: Statement[]) {
	return batchDatabase(await requireDatabaseId(), statements);
}

/** Starts or checks on an export of a database as SQL (see `DatabaseDriver.exportSql`). */
export function exportDatabase(databaseId: string, bookmark: string | null) {
	return timed('export', () => database.exportSql(databaseId, bookmark));
}

/** Runs a SQL file on a database as one transaction (see `DatabaseDriver.importSql`). */
export function importDatabase(databaseId: string, sql: Uint8Array<ArrayBuffer>) {
	return timed('import', () => database.importSql(databaseId, sql));
}

/** Checks on an import started with `importDatabase`. */
export function pollDatabaseImport(databaseId: string, bookmark: string) {
	return timed('import poll', () => database.pollImport(databaseId, bookmark));
}
