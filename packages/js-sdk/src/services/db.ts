import type { Pouchbase } from '../client.js';
import { pending, PouchbaseError } from '../error.js';
import type { Pending } from '../error.js';
import { compileInclude, compileOrderBy, compileSelect, compileWhere } from '../query.js';
import type { FieldName, Filter, OrderBy, Selected, Where } from '../query.js';
import type { RealtimeEvent, RealtimeSubscription } from '../realtime/connection.js';
import type { SubscribeOptions } from './realtime.js';

/** A record of a collection without generated types. */
export type AnyRecord = Record<string, unknown>;

/**
 * An entry of the schema: `{ $record, $create }` from the generated `Schema`, or only a record type
 * (as in `Collections`).
 */
export type RecordOf<E> = E extends { $record: infer R } ? R : E;

/** What to send to create a record of a schema entry. */
export type CreateOf<E> = E extends { $create: infer C } ? C : Partial<RecordOf<E>>;

/**
 * The collection each relation and file field of a schema entry points to, such as
 * `{ author: 'users' }` (`$relations` in the generated `Schema`).
 */
export type RelationsOf<E> = E extends { $relations: infer L } ? L : Record<never, never>;

/** Relations of a collection that isn't typed: any field name. */
export type AnyRelations = Record<string, string>;

/** The schema entry of the collection named `N`. */
type EntryOf<Schema, N> = N extends keyof Schema ? Schema[N] : never;

/** `include` for a collection that isn't typed. */
export type AnyInclude = { [field: string]: true | { include?: AnyInclude } };

/**
 * Which relations to return as records instead of ids, typed by the relations `L` of a collection
 * (see `RelationsOf`): `true`, or `{ include }` to include relations of the related records too, up
 * to three levels deep.
 *
 * ```ts
 * { author: true, comments: { include: { author: true } } }
 * ```
 */
export type Include<Schema, L> = string extends keyof L
	? AnyInclude
	: {
			[F in keyof L & string]?:
				true | { include?: Include<Schema, RelationsOf<EntryOf<Schema, L[F]>>> };
		};

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** A related record of collection `N`, with the relations in `Option.include` included too. */
type Related<Schema, N, Option> = Included<
	RecordOf<EntryOf<Schema, N>>,
	RecordOf<EntryOf<Schema, N>>,
	Schema,
	RelationsOf<EntryOf<Schema, N>>,
	Option extends { include: infer J } ? J : undefined
>;

/**
 * `T` (a record `R` or a selection of it) with the relations in `I` replaced by their records: a
 * record or `null` for a single relation, an array of records for a multiple one.
 */
export type Included<R, T, Schema, L, I> = [I] extends [undefined]
	? T
	: string extends keyof L
		? T
		: Simplify<
				Omit<T, keyof I> & {
					[F in keyof I & keyof L & keyof R]: NonNullable<R[F]> extends readonly unknown[]
						? Related<Schema, L[F], I[F]>[]
						: Related<Schema, L[F], I[F]> | null;
				}
			>;

/** Options of every request. */
export type CallOptions = {
	signal?: AbortSignal;
};

/** Options for `find()`, `insert()` and `patch()`. */
export type SelectOptions<S, I = undefined> = CallOptions & {
	/** Only return these fields; the result type has only them too. */
	select?: S;
	/**
	 * Relations to return as records instead of ids; they are returned even when `select` leaves
	 * them out. Related records the view rule of their collection hides are left out (`null` for a
	 * single relation).
	 */
	include?: I;
};

/** Options for `findMany()`. */
export type FindManyOptions<R, S, I = undefined> = SelectOptions<S, I> & {
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
export type FindFirstOptions<R, S, I = undefined> = Omit<
	FindManyOptions<R, S, I>,
	'limit' | 'page'
>;

/** Options for `iterate()` and `findAll()`. */
export type IterateOptions<R, S, I = undefined> = Omit<
	FindManyOptions<R, S, I>,
	'limit' | 'page'
> & {
	/** Records per request, 1 to 500. Defaults to 200. */
	batchSize?: number;
};

/** Options for `subscribe()`. */
export type CollectionSubscribeOptions<R, S, I = undefined> = Omit<
	SubscribeOptions<R>,
	'select' | 'include'
> & {
	/** Only changes to this record. */
	id?: string;
	/** Only these fields of each record; the event type has only them too. */
	select?: S;
	/** Relations to send as records instead of ids, as in `find()`. */
	include?: I;
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

/** The selection `S` of record `R`, with the relations in `I` included (see `Included`). */
type Output<R, S, Schema, L, I> = Included<R, Selected<R, S>, Schema, L, I>;

/**
 * The records of one collection (`/api/collections/<name>/records`), typed by `R` (a record), `C`
 * (what to send to create one), and the `Schema` with the collections its relations `L` point to
 * (see `RelationsOf`). What a caller may do follows the collection's API rules: a locked rule
 * fails with `forbidden`, and records a rule doesn't match are left out of lists and are "not
 * found" otherwise.
 */
export class CollectionClient<
	R = AnyRecord,
	C = Partial<R>,
	Schema = Record<never, never>,
	L = AnyRelations
> {
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
	find<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(id: string, options: SelectOptions<S, I> = {}): Pending<Output<R, S, Schema, L, I> | null> {
		return pending(
			this.#pb
				.send<Output<R, S, Schema, L, I>>(this.#path(id), {
					query: { fields: compileSelect(options.select), expand: compileInclude(options.include) },
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
	findOrThrow<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(id: string, options: SelectOptions<S, I> = {}): Pending<Output<R, S, Schema, L, I>> {
		return pending(
			this.#pb.send<Output<R, S, Schema, L, I>>(this.#path(id), {
				query: { fields: compileSelect(options.select), expand: compileInclude(options.include) },
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
	findMany<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(options: FindManyOptions<R, S, I> = {}): Pending<Page<Output<R, S, Schema, L, I>>> {
		return pending(
			this.#pb
				.send<ListResponse<Output<R, S, Schema, L, I>>>(this.#path(), {
					query: {
						page: options.page,
						perPage: options.limit,
						filter: compileWhere(options.where) || undefined,
						sort: compileOrderBy(options.orderBy) || undefined,
						fields: compileSelect(options.select),
						expand: compileInclude(options.include)
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
	findFirst<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(options: FindFirstOptions<R, S, I> = {}): Pending<Output<R, S, Schema, L, I> | null> {
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
	async *iterate<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(
		options: IterateOptions<R, S, I> = {}
	): AsyncGenerator<Output<R, S, Schema, L, I>, void, undefined> {
		const { batchSize = 200, ...query } = options;
		const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 500);

		for (let page = 1; ; page++) {
			const result = await this.findMany<S, I>({ ...query, limit, page });

			yield* result.items;

			if (!result.hasMore || !result.items.length) {
				return;
			}
		}
	}

	/** Every record that matches, in one array (see `iterate()` for large collections). */
	findAll<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(options: IterateOptions<R, S, I> = {}): Pending<Output<R, S, Schema, L, I>[]> {
		return pending(
			(async () => {
				const items: Output<R, S, Schema, L, I>[] = [];

				for await (const item of this.iterate<S, I>(options)) {
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
	insert<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(data: C, options: SelectOptions<S, I> = {}): Pending<Output<R, S, Schema, L, I>, FieldName<C>> {
		return pending(
			this.#pb.send<Output<R, S, Schema, L, I>>(this.#path(), {
				method: 'POST',
				body: data,
				query: { fields: compileSelect(options.select), expand: compileInclude(options.include) },
				signal: options.signal
			})
		);
	}

	/**
	 * Changes the given fields of a record and returns it; other fields keep their value. Fails
	 * with `not_found` when the record doesn't exist or the update rule doesn't allow it.
	 */
	patch<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(
		id: string,
		data: Partial<C>,
		options: SelectOptions<S, I> = {}
	): Pending<Output<R, S, Schema, L, I>, FieldName<C>> {
		return pending(
			this.#pb.send<Output<R, S, Schema, L, I>>(this.#path(id), {
				method: 'PATCH',
				body: data,
				query: { fields: compileSelect(options.select), expand: compileInclude(options.include) },
				signal: options.signal
			})
		);
	}

	/**
	 * Calls `callback` with every change to the records of this collection (or to record `id`) that
	 * the view rule lets you see, as they are saved. See `pb.realtime`.
	 *
	 * ```ts
	 * const subscription = pb.db.posts.subscribe((event) => console.log(event.action, event.record), {
	 * 	where: { status: 'published' },
	 * 	select: ['id', 'title']
	 * });
	 * subscription.unsubscribe();
	 * ```
	 */
	subscribe<
		const S extends readonly FieldName<R>[] | undefined = undefined,
		const I extends Include<Schema, L> | undefined = undefined
	>(
		callback: (event: RealtimeEvent<Output<R, S, Schema, L, I>>) => void,
		options: CollectionSubscribeOptions<R, S, I> = {}
	): RealtimeSubscription {
		const { id, select, include, ...rest } = options;

		return this.#pb.realtime.subscribe<Output<R, S, Schema, L, I>>(
			id === undefined ? this.name : `${this.name}/${id}`,
			callback,
			{
				...rest,
				select: select as readonly string[] | undefined,
				include: include as AnyInclude | undefined
			} as SubscribeOptions<Output<R, S, Schema, L, I>>
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
	readonly [K in keyof S & string]: CollectionClient<
		RecordOf<S[K]>,
		CreateOf<S[K]>,
		S,
		RelationsOf<S[K]>
	>;
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
