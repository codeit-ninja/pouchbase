import type { Pouchbase } from '../client.js';
import { pending, PouchbaseError } from '../error.js';
import type { Pending } from '../error.js';
import { compileOrderBy, compileSelect, compileWhere } from '../query.js';
import type { FieldName, Filter, OrderBy, Selected, Where } from '../query.js';

/** A record of a collection without generated types. */
export type AnyRecord = Record<string, unknown>;

/**
 * An entry of the schema: `{ $record, $create }` from the generated `Schema`, or only a record type
 * (as in `Collections`).
 */
export type RecordOf<E> = E extends { $record: infer R } ? R : E;

/** What to send to create a record of a schema entry. */
export type CreateOf<E> = E extends { $create: infer C } ? C : Partial<RecordOf<E>>;

/** Options of every request. */
export type CallOptions = {
	signal?: AbortSignal;
};

/** Options for `find()`, `insert()` and `patch()`. */
export type SelectOptions<S> = CallOptions & {
	/** Only return these fields; the result type has only them too. */
	select?: S;
};

/** Options for `findMany()`. */
export type FindManyOptions<R, S> = SelectOptions<S> & {
	/** Which records; all of them without it. */
	where?: Where<R> | Filter;
	/** The order; the order of creation without it. */
	orderBy?: OrderBy<R>;
	/** Records per page, 1 to 500. Defaults to 30. */
	limit?: number;
	/** The page, from 1. Defaults to 1. */
	page?: number;
};

/** Options for `findFirst()`. */
export type FindFirstOptions<R, S> = Omit<FindManyOptions<R, S>, 'limit' | 'page'>;

/** Options for `iterate()` and `findAll()`. */
export type IterateOptions<R, S> = Omit<FindManyOptions<R, S>, 'limit' | 'page'> & {
	/** Records per request, 1 to 500. Defaults to 200. */
	batchSize?: number;
};

/** One page of `findMany()`. */
export type Page<T> = {
	items: T[];
	/** Records that match, on all pages. */
	total: number;
	page: number;
	/** Number of pages. */
	pages: number;
	/** Whether there is a page after this one. */
	hasMore: boolean;
};

type ListResponse<T> = {
	page: number;
	perPage: number;
	totalItems: number;
	totalPages: number;
	items: T[];
};

/**
 * The records of one collection (`/api/collections/<name>/records`), typed by `R` (a record) and
 * `C` (what to send to create one). What a caller may do follows the collection's API rules: a
 * locked rule fails with `forbidden`, and records a rule doesn't match are left out of lists and
 * are "not found" otherwise.
 */
export class CollectionClient<R = AnyRecord, C = Partial<R>> {
	readonly #pb: Pouchbase<object>;
	/** Name of the collection. */
	readonly name: string;

	constructor(pb: Pouchbase<object>, name: string) {
		this.#pb = pb;
		this.name = name;
	}

	#path(id?: string) {
		const base = `/api/collections/${encodeURIComponent(this.name)}/records`;
		return id === undefined ? base : `${base}/${encodeURIComponent(id)}`;
	}

	/**
	 * A record by id, or `null` when it doesn't exist or the view rule hides it.
	 *
	 * ```ts
	 * const post = await pb.db.posts.find(id, { select: ['id', 'title'] });
	 * ```
	 */
	find<const S extends readonly FieldName<R>[] | undefined = undefined>(
		id: string,
		options: SelectOptions<S> = {}
	): Pending<Selected<R, S> | null> {
		return pending(
			this.#pb
				.send<Selected<R, S>>(this.#path(id), {
					query: { fields: compileSelect(options.select) },
					signal: options.signal
				})
				.catch((error: unknown) => {
					if (
						error instanceof PouchbaseError &&
						error.kind === 'not_found' &&
						error.message === 'Record not found'
					) {
						return null;
					}

					throw error;
				})
		);
	}

	/**
	 * A record by id; fails with a `not_found` error when there is none.
	 */
	findOrThrow<const S extends readonly FieldName<R>[] | undefined = undefined>(
		id: string,
		options: SelectOptions<S> = {}
	): Pending<Selected<R, S>> {
		return pending(
			this.#pb.send<Selected<R, S>>(this.#path(id), {
				query: { fields: compileSelect(options.select) },
				signal: options.signal
			})
		);
	}

	/**
	 * One page of records.
	 *
	 * ```ts
	 * const { items, total, hasMore } = await pb.db.posts.findMany({
	 * 	where: { status: 'published', views: { gte: 10 } },
	 * 	orderBy: { created_at: 'desc' },
	 * 	select: ['id', 'title'],
	 * 	limit: 20
	 * });
	 * ```
	 */
	findMany<const S extends readonly FieldName<R>[] | undefined = undefined>(
		options: FindManyOptions<R, S> = {}
	): Pending<Page<Selected<R, S>>> {
		return pending(
			this.#pb
				.send<ListResponse<Selected<R, S>>>(this.#path(), {
					query: {
						page: options.page,
						perPage: options.limit,
						filter: compileWhere(options.where) || undefined,
						sort: compileOrderBy(options.orderBy) || undefined,
						fields: compileSelect(options.select)
					},
					signal: options.signal
				})
				.then((response) => ({
					items: response.items,
					total: response.totalItems,
					page: response.page,
					pages: response.totalPages,
					hasMore: response.page < response.totalPages
				}))
		);
	}

	/** The first record that matches, or `null`. */
	findFirst<const S extends readonly FieldName<R>[] | undefined = undefined>(
		options: FindFirstOptions<R, S> = {}
	): Pending<Selected<R, S> | null> {
		return pending(this.findMany({ ...options, limit: 1 }).then((page) => page.items[0] ?? null));
	}

	/** How many records match. */
	count(where?: Where<R> | Filter, options: CallOptions = {}): Pending<number> {
		return pending(
			this.findMany({ where, limit: 1, signal: options.signal }).then((page) => page.total)
		);
	}

	/**
	 * Every record that matches, fetched page by page as you go:
	 *
	 * ```ts
	 * for await (const post of pb.db.posts.iterate({ where: { status: 'draft' } })) {
	 * 	console.log(post.title);
	 * }
	 * ```
	 */
	async *iterate<const S extends readonly FieldName<R>[] | undefined = undefined>(
		options: IterateOptions<R, S> = {}
	): AsyncGenerator<Selected<R, S>, void, undefined> {
		const { batchSize = 200, ...query } = options;
		const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 500);

		for (let page = 1; ; page++) {
			const result = await this.findMany<S>({ ...query, limit, page });

			yield* result.items;

			if (!result.hasMore || !result.items.length) {
				return;
			}
		}
	}

	/** Every record that matches, in one array (see `iterate()` for large collections). */
	findAll<const S extends readonly FieldName<R>[] | undefined = undefined>(
		options: IterateOptions<R, S> = {}
	): Pending<Selected<R, S>[]> {
		return pending(
			(async () => {
				const items: Selected<R, S>[] = [];

				for await (const item of this.iterate<S>(options)) {
					items.push(item);
				}

				return items;
			})()
		);
	}

	/**
	 * Creates a record and returns it. Fields that are left out get their default value; dates may
	 * be `Date`s. Fails with `invalid` (`issues` per field), `conflict` or `forbidden`.
	 *
	 * ```ts
	 * const post = await pb.db.posts.insert({ title: 'Hello', published: true });
	 * ```
	 */
	insert<const S extends readonly FieldName<R>[] | undefined = undefined>(
		data: C,
		options: SelectOptions<S> = {}
	): Pending<Selected<R, S>, FieldName<C>> {
		return pending(
			this.#pb.send<Selected<R, S>>(this.#path(), {
				method: 'POST',
				body: data,
				query: { fields: compileSelect(options.select) },
				signal: options.signal
			})
		);
	}

	/**
	 * Changes the given fields of a record and returns it; other fields keep their value. Fails
	 * with `not_found` when the record doesn't exist or the update rule doesn't allow it.
	 */
	patch<const S extends readonly FieldName<R>[] | undefined = undefined>(
		id: string,
		data: Partial<C>,
		options: SelectOptions<S> = {}
	): Pending<Selected<R, S>, FieldName<C>> {
		return pending(
			this.#pb.send<Selected<R, S>>(this.#path(id), {
				method: 'PATCH',
				body: data,
				query: { fields: compileSelect(options.select) },
				signal: options.signal
			})
		);
	}

	/**
	 * Deletes a record. Fails with `not_found` when it doesn't exist or the delete rule doesn't
	 * allow it.
	 */
	remove(id: string, options: CallOptions = {}): Pending<void> {
		return pending(
			this.#pb
				.send(this.#path(id), { method: 'DELETE', signal: options.signal })
				.then(() => undefined)
		);
	}
}

/**
 * The collections of a schema, each as a typed `CollectionClient`: `pb.db.posts`. Collections that
 * aren't in the schema are reached with `pb.db.$collection(name)`.
 */
export type Db<S> = {
	readonly [K in keyof S & string]: CollectionClient<RecordOf<S[K]>, CreateOf<S[K]>>;
} & {
	/** A collection by name, typed by hand (or untyped). */
	$collection<R = AnyRecord, C = Partial<R>>(name: string): CollectionClient<R, C>;
};

/** `pb.db`: a client per collection name, made when it is first used. */
export function createDb<S>(pb: Pouchbase<object>): Db<S> {
	const clients = new Map<string, CollectionClient>();
	const client = (name: string) => {
		let found = clients.get(name);

		if (!found) {
			found = new CollectionClient(pb, name);
			clients.set(name, found);
		}

		return found;
	};

	return new Proxy({} as Db<S>, {
		get(_target, property) {
			if (property === '$collection') {
				return client;
			}

			// Collection names start with a lowercase letter; anything else (such as `then`, which
			// `await` looks for) isn't a collection.
			if (typeof property !== 'string' || !/^[a-z]/.test(property) || property === 'then') {
				return undefined;
			}

			return client(property);
		}
	});
}
