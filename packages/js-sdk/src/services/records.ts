import type { Pouchbase } from '../client.js';
import { PouchbaseError } from '../error.js';

/** A record of a collection without a generated type: a value per field. */
export type BaseRecord = Record<string, unknown>;

/**
 * A value for a field when creating or updating a record. Besides the stored value, the API
 * accepts `true`/`false` for booleans, arrays for multiple relations and lists, and any JSON value
 * for JSON fields.
 */
export type RecordInput<T> = {
	[K in keyof T]?: T[K] | boolean | unknown[] | Record<string, unknown> | null;
};

/** One page of `pb.collection(name).getList()`. */
export type ListResult<T> = {
	page: number;
	perPage: number;
	totalItems: number;
	totalPages: number;
	items: T[];
};

/** Options for listing records. */
export type ListOptions = {
	/**
	 * Fields to sort on, separated by commas, with `-` in front for descending:
	 * `-created_at,title`. Without one, records come in the order they were created.
	 */
	sort?: string;
	/**
	 * A filter expression such as `status = "published" && views > 10`. Build one with values from
	 * users with `pb.filter()`, so they are escaped.
	 */
	filter?: string;
	signal?: AbortSignal;
};

/** Options for `getFullList()`. */
export type FullListOptions = ListOptions & {
	/** Records per request, at most 500. Defaults to 500. */
	batch?: number;
};

/**
 * Records of one collection (`/api/collections/<name>/records`), from `pb.collection(name)`. What
 * a caller may do is decided by the collection's API rules; a locked rule answers `403`, and
 * records a rule doesn't match are left out of lists and are "not found" otherwise.
 */
export class RecordService<T = BaseRecord> {
	readonly #pb: Pouchbase;
	/** Name of the collection. */
	readonly collection: string;

	constructor(pb: Pouchbase, collection: string) {
		this.#pb = pb;
		this.collection = collection;
	}

	#path(id?: string) {
		const base = `/api/collections/${encodeURIComponent(this.collection)}/records`;
		return id === undefined ? base : `${base}/${encodeURIComponent(id)}`;
	}

	/**
	 * One page of records.
	 *
	 * ```ts
	 * const { items, totalItems } = await pb.collection('posts').getList(1, 20, {
	 * 	filter: 'status = "published"',
	 * 	sort: '-created_at'
	 * });
	 * ```
	 *
	 * @param page - Starts at 1.
	 * @param perPage - At most 500.
	 * @throws {PouchbaseError} `400` for an invalid filter or sort, `403` when the list rule is
	 *   locked, `404` when the collection doesn't exist.
	 */
	getList(page = 1, perPage = 30, options: ListOptions = {}): Promise<ListResult<T>> {
		return this.#pb.send<ListResult<T>>(this.#path(), {
			query: { page, perPage, sort: options.sort, filter: options.filter },
			signal: options.signal
		});
	}

	/**
	 * Every record that matches, fetched page by page.
	 * @throws {PouchbaseError} Like `getList()`.
	 */
	async getFullList(options: FullListOptions = {}): Promise<T[]> {
		const perPage = Math.min(Math.max(options.batch ?? 500, 1), 500);
		const items: T[] = [];

		for (let page = 1; ; page++) {
			const result = await this.getList(page, perPage, options);

			items.push(...result.items);

			if (page >= result.totalPages || !result.items.length) {
				return items;
			}
		}
	}

	/**
	 * The first record that matches a filter, or `null` when none does.
	 *
	 * ```ts
	 * const post = await pb.collection('posts').getFirstListItem(pb.filter('slug = {:slug}', { slug }));
	 * ```
	 *
	 * @throws {PouchbaseError} Like `getList()`.
	 */
	async getFirstListItem(
		filter: string,
		options: Omit<ListOptions, 'filter'> = {}
	): Promise<T | null> {
		const { items } = await this.getList(1, 1, { ...options, filter });

		return items[0] ?? null;
	}

	/**
	 * One record by id, or `null` when it doesn't exist or the view rule doesn't allow it.
	 * @throws {PouchbaseError} `403` when the view rule is locked.
	 */
	async getOne(id: string, options: { signal?: AbortSignal } = {}): Promise<T | null> {
		try {
			return await this.#pb.send<T>(this.#path(id), { signal: options.signal });
		} catch (error) {
			if (
				error instanceof PouchbaseError &&
				error.status === 404 &&
				error.message !== 'Collection not found'
			) {
				return null;
			}

			throw error;
		}
	}

	/**
	 * Creates a record and returns it. Fields that are left out get their default value.
	 *
	 * ```ts
	 * const post = await pb.collection('posts').create({ title: 'Hello', published: true });
	 * ```
	 *
	 * @throws {PouchbaseError} `400` with `issues` per field for invalid values, `409` when a unique
	 *   field's value is taken, `403` when the create rule doesn't allow it.
	 */
	create(data: RecordInput<T>, options: { signal?: AbortSignal } = {}): Promise<T> {
		return this.#pb.send<T>(this.#path(), { method: 'POST', body: data, signal: options.signal });
	}

	/**
	 * Changes the given fields of a record and returns it; other fields keep their value.
	 * @throws {PouchbaseError} Like `create()`, and `404` when the record doesn't exist or the
	 *   update rule doesn't allow it.
	 */
	update(id: string, data: RecordInput<T>, options: { signal?: AbortSignal } = {}): Promise<T> {
		return this.#pb.send<T>(this.#path(id), {
			method: 'PATCH',
			body: data,
			signal: options.signal
		});
	}

	/**
	 * Deletes a record.
	 * @throws {PouchbaseError} `404` when the record doesn't exist or the delete rule doesn't allow
	 *   it, `403` when the delete rule is locked.
	 */
	async delete(id: string, options: { signal?: AbortSignal } = {}): Promise<void> {
		await this.#pb.send(this.#path(id), { method: 'DELETE', signal: options.signal });
	}
}

/**
 * Fills `{:name}` placeholders in a filter expression with escaped values, so values from users
 * can't change the expression:
 *
 * ```ts
 * filter('title ~ {:search} && created_at > {:since}', { search, since: Date.now() - 86_400_000 });
 * ```
 *
 * Strings are quoted, numbers and booleans are written as is, `null` and `undefined` as `null`,
 * and `Date`s as ISO 8601 strings.
 */
export function filter(expression: string, params: Record<string, unknown> = {}): string {
	return expression.replace(/\{:(\w+)\}/g, (placeholder, name: string) => {
		if (!(name in params)) {
			return placeholder;
		}

		const value = params[name];

		if (value === null || value === undefined) {
			return 'null';
		}

		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}

		const text =
			value instanceof Date
				? value.toISOString()
				: typeof value === 'string'
					? value
					: JSON.stringify(value);

		return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	});
}
