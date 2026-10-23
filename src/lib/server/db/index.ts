import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { rawBatch, rawQuery } from './query';
import * as schema from './schema';

export const db = drizzle(
	async (sql, params, method) => {
		const rows = await rawQuery(sql, params);
		return { rows: method === 'get' ? rows[0] : rows };
	},
	// `db.batch([...])` sends its queries in one round-trip; drizzle picks the rows per method.
	async (queries) => (await rawBatch(queries)).map((rows) => ({ rows })),
	{ schema }
);

export * from './schema';
