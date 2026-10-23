import type { DatabaseDriver, DatabaseInfo, QueryResult, SqlImport, Statement } from '../types';

import { api, cloudflareFetch, CloudflareApiError, failure } from './api';
import { attachBindings, d1Binding } from './bindings';

/**
 * D1 through a binding when the deployed Worker has one for the database (see `./bindings`), and
 * through the HTTP API otherwise; the `/raw` endpoint returns rows as arrays. Every API call is a
 * round-trip to the API, so related statements go through `batch` (one request) where possible.
 */

interface D1DatabaseInfo {
	uuid: string;
	name: string;
}

interface D1RawResult {
	results: { columns: string[]; rows: unknown[][] };
}

function toResult(result: D1RawResult | undefined): QueryResult {
	return {
		columns: result?.results.columns ?? [],
		rows: result?.results.rows ?? []
	};
}

/** The state of an export or import; the API reports failures in the body, not the status. */
interface D1JobResponse {
	success: boolean;
	at_bookmark: string;
	status: 'active' | 'complete' | 'error';
	error?: string;
	/** Export: the dump once it's ready. */
	result?: { filename?: string; signed_url?: string };
}

/** Import: where to upload the SQL file, unless D1 already has a file with this checksum. */
interface D1ImportInit extends Partial<D1JobResponse> {
	upload_url?: string;
	filename?: string;
}

function jobFailure(response: Partial<D1JobResponse>) {
	return new CloudflareApiError(500, [{ code: 0, message: response.error || 'D1 job failed' }]);
}

function toImport(response: D1JobResponse): SqlImport {
	if (!response.success || response.status === 'error') {
		throw jobFailure(response);
	}

	return { bookmark: response.at_bookmark, done: response.status === 'complete' };
}

/** D1 identifies an uploaded import file by its MD5 checksum. */
async function md5(data: Uint8Array<ArrayBuffer>) {
	let digest: ArrayBuffer;

	try {
		// Workers support MD5 in Web Crypto.
		digest = await crypto.subtle.digest('MD5', data);
	} catch {
		// Node doesn't; `getBuiltinModule` loads `node:crypto` without an import the Worker build sees.
		const { createHash } = (
			globalThis as unknown as {
				process: { getBuiltinModule(id: 'node:crypto'): typeof import('node:crypto') };
			}
		).process.getBuiltinModule('node:crypto');

		return createHash('md5').update(data).digest('hex');
	}

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toInfo(database: D1DatabaseInfo): DatabaseInfo {
	return { id: database.uuid, name: database.name };
}

/** A binding can't bind `undefined`; the API treats it as `null`, so do the same. */
function prepare(binding: D1Database, { sql, params = [] }: Statement) {
	return binding.prepare(sql).bind(...params.map((value) => (value === undefined ? null : value)));
}

/**
 * A batch over a binding returns rows as objects, so the columns are read from the first row
 * (an empty result has none). Columns with the same name collapse into one, as in Drizzle's own D1
 * driver; batched queries select distinct names.
 */
function objectsToResult(objects: Record<string, unknown>[]): QueryResult {
	const columns = Object.keys(objects[0] ?? {});

	return { columns, rows: objects.map((row) => columns.map((column) => row[column])) };
}

export const database: DatabaseDriver = {
	async find(name) {
		const databases = await api<D1DatabaseInfo[]>(`/d1/database?name=${encodeURIComponent(name)}`);
		const found = databases.find((db) => db.name === name);

		return found ? toInfo(found) : null;
	},

	async create(name) {
		return toInfo(
			await api<D1DatabaseInfo>('/d1/database', { method: 'POST', body: JSON.stringify({ name }) })
		);
	},

	async delete(databaseId) {
		const response = await cloudflareFetch(`/d1/database/${databaseId}`, { method: 'DELETE' });

		if (!response.ok && response.status !== 404) {
			throw await failure(response);
		}
	},

	async query(databaseId, sql, params = []) {
		const binding = d1Binding(databaseId);

		if (binding) {
			const [columns = [], ...rows] = await prepare(binding, { sql, params }).raw({
				columnNames: true
			});

			return { columns, rows };
		}

		const [result] = await api<D1RawResult[]>(`/d1/database/${databaseId}/raw`, {
			method: 'POST',
			body: JSON.stringify({ sql, params })
		});

		return toResult(result);
	},

	async batch(databaseId, statements) {
		if (!statements.length) {
			return [];
		}

		const binding = d1Binding(databaseId);

		if (binding) {
			const results = await binding.batch(
				statements.map((statement) => prepare(binding, statement))
			);

			return results.map((result) => objectsToResult(result.results as Record<string, unknown>[]));
		}

		const results = await api<D1RawResult[]>(`/d1/database/${databaseId}/raw`, {
			method: 'POST',
			body: JSON.stringify({
				batch: statements.map(({ sql, params = [] }) => ({ sql, params }))
			})
		});

		return statements.map((_, index) => toResult(results[index]));
	},

	attach: attachBindings,

	route(databaseId) {
		return d1Binding(databaseId) ? 'binding' : 'api';
	},

	async exportSql(databaseId, bookmark) {
		const response = await api<D1JobResponse>(`/d1/database/${databaseId}/export`, {
			method: 'POST',
			body: JSON.stringify({
				output_format: 'polling',
				...(bookmark && { current_bookmark: bookmark })
			})
		});

		if (!response.success || response.status === 'error') {
			throw jobFailure(response);
		}

		return {
			bookmark: response.at_bookmark,
			url: response.status === 'complete' ? (response.result?.signed_url ?? null) : null
		};
	},

	async importSql(databaseId, sql) {
		const etag = await md5(sql);
		const path = `/d1/database/${databaseId}/import`;

		const init = await api<D1ImportInit>(path, {
			method: 'POST',
			body: JSON.stringify({ action: 'init', etag })
		});

		// D1 already has this file: `init` answered with the state of its import.
		if (!init.upload_url) {
			return toImport(init as D1JobResponse);
		}

		const upload = await fetch(init.upload_url, { method: 'PUT', body: sql });

		if (!upload.ok || upload.headers.get('etag')?.replace(/^"|"$/g, '') !== etag) {
			throw new CloudflareApiError(upload.status, [
				{ code: 0, message: 'Uploading the SQL file to D1 failed' }
			]);
		}

		return toImport(
			await api<D1JobResponse>(path, {
				method: 'POST',
				body: JSON.stringify({ action: 'ingest', etag, filename: init.filename })
			})
		);
	},

	async pollImport(databaseId, bookmark) {
		return toImport(
			await api<D1JobResponse>(`/d1/database/${databaseId}/import`, {
				method: 'POST',
				body: JSON.stringify({ action: 'poll', current_bookmark: bookmark })
			})
		);
	}
};
