import { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } from '$app/env/private';

/**
 * Minimal client for the Cloudflare REST API. The D1 databases are created through the API during
 * installation and queried through the HTTP API afterwards, so no wrangler binding is needed.
 *
 * - `pouchbase`: the system database (users, sessions, settings), queried via `rawQuery`.
 * - the app database: holds the data of the app built on Pouchbase (like PocketBase's data store).
 *   It gets a random name; its id and name are stored in the system database's settings.
 */

export const DATABASE_NAME = 'pouchbase';

const API_URL = 'https://api.cloudflare.com/client/v4';

interface ApiResponse<T> {
	success: boolean;
	errors: { code: number; message: string }[];
	result: T;
}

export interface D1Database {
	uuid: string;
	name: string;
}

interface D1RawResult {
	results: { columns: string[]; rows: unknown[][] };
}

export class CloudflareApiError extends Error {
	constructor(
		readonly status: number,
		readonly errors: { code: number; message: string }[]
	) {
		super(
			`Cloudflare API (${status}): ${errors.map((e) => `[${e.code}] ${e.message}`).join(', ') || 'unknown error'}`
		);
	}
}

/** The database does not exist (yet), so the installation has not run. */
export class DatabaseMissingError extends Error {
	constructor() {
		super(`D1 database "${DATABASE_NAME}" does not exist`);
	}
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${API_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
			'Content-Type': 'application/json',
			...init.headers
		}
	});

	const body = (await response.json()) as ApiResponse<T>;

	if (!response.ok || !body.success) {
		throw new CloudflareApiError(response.status, body.errors ?? []);
	}

	return body.result;
}

// Cached per isolate so we don't look up the id for every query.
let databaseId: string | undefined;

async function findDatabase(name: string) {
	const databases = await api<D1Database[]>(`/d1/database?name=${encodeURIComponent(name)}`);
	return databases.find((db) => db.name === name) ?? null;
}

/** Creates a new D1 database with the given name. */
export async function createDatabase(name: string) {
	return api<D1Database>('/d1/database', { method: 'POST', body: JSON.stringify({ name }) });
}

/** Returns the database id, or `null` if it does not exist yet. */
export async function getDatabaseId() {
	databaseId ??= (await findDatabase(DATABASE_NAME))?.uuid;
	return databaseId ?? null;
}

/** Looks up the database and creates it if it does not exist yet. */
export async function ensureDatabase() {
	databaseId = (await getDatabaseId()) ?? (await createDatabase(DATABASE_NAME)).uuid;
	return databaseId;
}

/**
 * Runs a single statement on any D1 database and returns the rows as arrays
 * (the `/raw` endpoint format).
 */
export async function queryDatabase(databaseId: string, sql: string, params: unknown[] = []) {
	const [result] = await api<D1RawResult[]>(`/d1/database/${databaseId}/raw`, {
		method: 'POST',
		body: JSON.stringify({ sql, params })
	});

	return result?.results.rows ?? [];
}

/** Like `queryDatabase`, but returns each row as an object keyed by column name. */
export async function queryObjects(databaseId: string, sql: string, params: unknown[] = []) {
	const [result] = await api<D1RawResult[]>(`/d1/database/${databaseId}/raw`, {
		method: 'POST',
		body: JSON.stringify({ sql, params })
	});

	const columns = result?.results.columns ?? [];

	return (result?.results.rows ?? []).map(
		(row) =>
			Object.fromEntries(columns.map((column, index) => [column, row[index]])) as Record<
				string,
				unknown
			>
	);
}

/** Runs a single statement on the system database. */
export async function rawQuery(sql: string, params: unknown[] = []) {
	const id = await getDatabaseId();

	if (!id) {
		throw new DatabaseMissingError();
	}

	return queryDatabase(id, sql, params);
}
