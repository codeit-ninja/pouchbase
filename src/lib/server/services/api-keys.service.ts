import type { ServiceError } from './base.service';
import type { ResultAsync } from 'neverthrow';

import { and, desc, eq, ne } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { generateToken, hashToken } from '../crypto';
import { apiKeys, functions } from '../db';
import { Service } from './base.service';

/**
 * API keys: secrets for server-side code (back-ends and functions) to call the parts of the API an
 * app user can't, such as `/api/mail/send`. Keys are sent as `Authorization: Bearer pbk_…`.
 * Admins create keys on the API keys page; every deployed function gets a key of its own as
 * `POUCHBASE_API_KEY`, renewed on each deploy. A key with the `service` scope also uses the
 * records API as an admin: the collections' API rules don't apply to it.
 */

/** `standard`: the server-only endpoints; `service`: those and the records API without API rules. */
export type ApiKeyScope = (typeof apiKeys.$inferSelect)['scope'];

/** An API key as the API keys page lists it; the key itself is only shown once. */
export type ApiKey = {
	id: string;
	name: string;
	/** The first characters of the key. */
	prefix: string;
	scope: ApiKeyScope;
	/** Set for the key of a function. */
	functionName: string | null;
	createdAt: Date;
	lastUsedAt: Date | null;
};

/** Prefix of API keys, so they are recognisable (e.g. by secret scanners). */
export const API_KEY_PREFIX = 'pbk_';

/** `last_used_at` is written at most this often per key. */
const LAST_USED_INTERVAL = 60 * 1000;

const COLUMNS = {
	id: apiKeys.id,
	name: apiKeys.name,
	prefix: apiKeys.prefix,
	scope: apiKeys.scope,
	functionName: functions.name,
	createdAt: apiKeys.createdAt,
	lastUsedAt: apiKeys.lastUsedAt
};

type QueryFailed = ServiceError<23000, 'API_KEYS_QUERY_FAILED'>;
type KeyNotFound = ServiceError<23001, 'API_KEY_NOT_FOUND'>;
type FunctionKey = ServiceError<23002, 'FUNCTION_KEY'>;

function newKey() {
	const key = `${API_KEY_PREFIX}${generateToken()}`;

	return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 6) };
}

export class ApiKeysService extends Service {
	/** Every key, newest first; the keys of functions too. */
	list(): ResultAsync<ApiKey[], QueryFailed> {
		return fromPromise(
			this.db
				.select(COLUMNS)
				.from(apiKeys)
				.leftJoin(functions, eq(functions.id, apiKeys.functionId))
				.orderBy(desc(apiKeys.createdAt)),
			(error) => this.error(23000, 'API_KEYS_QUERY_FAILED', error)
		);
	}

	/** Creates a key; `key` can't be read back later. */
	create(name: string, scope: ApiKeyScope): ResultAsync<ApiKey & { key: string }, QueryFailed> {
		const { key, prefix } = newKey();

		return fromPromise(
			(async () => {
				const [row] = await this.db
					.insert(apiKeys)
					.values({ name, prefix, scope, keyHash: await hashToken(key) })
					.returning();

				return {
					id: row.id,
					name: row.name,
					prefix: row.prefix,
					scope: row.scope,
					functionName: null,
					createdAt: row.createdAt,
					lastUsedAt: row.lastUsedAt,
					key
				};
			})(),
			(error) => this.error(23000, 'API_KEYS_QUERY_FAILED', error)
		);
	}

	/** Deletes a key; the key of a function goes with the function. */
	delete(id: string): ResultAsync<void, QueryFailed | KeyNotFound | FunctionKey> {
		return fromPromise(
			this.db.select({ functionId: apiKeys.functionId }).from(apiKeys).where(eq(apiKeys.id, id)),
			(error) => this.error(23000, 'API_KEYS_QUERY_FAILED', error)
		)
			.andThen(([row]) => {
				if (!row) {
					return errAsync(this.error(23001, 'API_KEY_NOT_FOUND'));
				}

				return row.functionId ? errAsync(this.error(23002, 'FUNCTION_KEY')) : okAsync(undefined);
			})
			.andThen(() =>
				fromPromise(this.db.delete(apiKeys).where(eq(apiKeys.id, id)), (error) =>
					this.error(23000, 'API_KEYS_QUERY_FAILED', error)
				)
			)
			.map(() => undefined);
	}

	/** The key with this value, `null` when there is none; records that it was used. */
	verify(key: string): ResultAsync<ApiKey | null, QueryFailed> {
		if (!key.startsWith(API_KEY_PREFIX)) {
			return okAsync(null);
		}

		return fromPromise(
			(async () => {
				const [row] = await this.db
					.select(COLUMNS)
					.from(apiKeys)
					.leftJoin(functions, eq(functions.id, apiKeys.functionId))
					.where(eq(apiKeys.keyHash, await hashToken(key)));

				if (!row) {
					return null;
				}

				const now = new Date();

				if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_INTERVAL) {
					await this.db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.id));
				}

				return { ...row, lastUsedAt: now };
			})(),
			(error) => this.error(23000, 'API_KEYS_QUERY_FAILED', error)
		);
	}

	/**
	 * A new key for a function, for its next deploy. Once that deploy succeeds, `keepFunctionKey`
	 * removes the function's older keys; when it fails, `deleteFunctionKey` removes the new one.
	 */
	issueFunctionKey(
		functionId: string,
		functionName: string
	): ResultAsync<{ id: string; key: string }, QueryFailed> {
		const { key, prefix } = newKey();

		return fromPromise(
			(async () => {
				const [row] = await this.db
					.insert(apiKeys)
					.values({
						name: `Function ${functionName}`,
						prefix,
						keyHash: await hashToken(key),
						functionId
					})
					.returning({ id: apiKeys.id });

				return { id: row.id, key };
			})(),
			(error) => this.error(23000, 'API_KEYS_QUERY_FAILED', error)
		);
	}

	/** Removes the function's keys other than this one (the key of the version that runs). */
	keepFunctionKey(functionId: string, id: string): ResultAsync<void, QueryFailed> {
		return fromPromise(
			this.db.delete(apiKeys).where(and(eq(apiKeys.functionId, functionId), ne(apiKeys.id, id))),
			(error) => this.error(23000, 'API_KEYS_QUERY_FAILED', error)
		).map(() => undefined);
	}

	deleteFunctionKey(id: string): ResultAsync<void, QueryFailed> {
		return fromPromise(this.db.delete(apiKeys).where(eq(apiKeys.id, id)), (error) =>
			this.error(23000, 'API_KEYS_QUERY_FAILED', error)
		).map(() => undefined);
	}
}
