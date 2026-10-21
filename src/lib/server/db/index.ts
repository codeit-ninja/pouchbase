import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { rawQuery } from '../cloudflare/d1';
import * as schema from './schema';

export const db = drizzle(
	async (sql, params, method) => {
		const rows = await rawQuery(sql, params);
		return { rows: method === 'get' ? rows[0] : rows };
	},
	{ schema }
);

export * from './schema';
