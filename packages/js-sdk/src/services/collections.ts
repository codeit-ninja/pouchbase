import type { Pouchbase } from '../client.js';
import { PouchbaseError } from '../error.js';

/** Field types, mirrored from `FIELD_TYPES` in the app (`src/lib/fields/field-types.ts`). */
export type FieldType =
	| 'id'
	| 'created'
	| 'updated'
	| 'text'
	| 'rich_text'
	| 'number'
	| 'integer'
	| 'boolean'
	| 'date'
	| 'email'
	| 'url'
	| 'json'
	| 'list'
	| 'relation'
	| 'file'
	| 'computed'
	| 'blob';

/** Settings of a field; each one only applies to some field types. */
export type FieldOptions = {
	/** `id`: how the key of a new record is generated (`random`, `uuid`, …). */
	generator?: string;
	/** `rich_text`: the stored format. */
	format?: string;
	/** `relation`: id of the related collection. */
	collectionId?: string;
	/** `relation` and `list`: an array of ids or items instead of one value. */
	multiple?: boolean;
	/** `list`: the items a record can pick from. */
	values?: string[];
	/** `file`: accepted MIME types, wildcards and extensions, such as `["image/*", ".pdf"]`. */
	accept?: string[];
	/** `file`: largest upload in bytes. */
	maxSize?: number;
	/** `computed`: the field the value is calculated from. */
	source?: string;
	/** `computed`: how the source value becomes this field's value. */
	transform?: string;
	/** `computed` with the `script` transform: the body of a function of `record` and `ctx`. */
	script?: string;
	/** The default value is an SQL expression. */
	defaultSql?: boolean;
};

/** A field of a collection, as the collections API returns it. */
export type CollectionField = {
	id: string;
	name: string;
	type: FieldType;
	required: boolean;
	unique: boolean;
	defaultValue: string | null;
	options: FieldOptions;
	/** Built-in fields (such as `users.email`) can't be renamed or deleted. */
	system: boolean;
	/** Display order, from 0. */
	position: number;
};

/** A custom index of a collection; "unique" fields have their own index. */
export type CollectionIndex = { name: string; columns: string[]; unique: boolean };

/** API rule actions; `null` is admins only, `""` everyone. */
export type ApiRules = Partial<
	Record<'list' | 'view' | 'create' | 'update' | 'delete', string | null>
>;

/** Thumbnail sizes of the `files` collection, such as `100x100`. */
export type ThumbnailSettings = { enabled: boolean; sizes: string[] };

/** A collection with its fields, indexes, API rules and settings (`GET /api/collections/<name>`). */
export type CollectionSchema = {
	id: string;
	name: string;
	/** Built-in collections (`users`, `files`) can't be renamed or deleted. */
	system: boolean;
	settings: { rules?: ApiRules; thumbnails?: ThumbnailSettings };
	fields: CollectionField[];
	indexes: CollectionIndex[];
};

/**
 * A field to create or change. A field with an `id`, or else the name of an existing field,
 * changes that field; other fields are added.
 */
export type FieldInput = {
	id?: string;
	name: string;
	type: FieldType;
	required?: boolean;
	unique?: boolean;
	defaultValue?: string | null;
	options?: FieldOptions;
};

/** An index to create. */
export type IndexInput = { columns: string[]; unique?: boolean };

/** Input of `pb.collections.create()`. */
export type CreateCollectionInput = {
	name: string;
	/** The fields in display order. */
	fields?: FieldInput[];
	indexes?: IndexInput[];
	rules?: ApiRules;
	thumbnails?: ThumbnailSettings;
};

/**
 * Input of `pb.collections.update()`: only the given parts change. `fields` and `indexes` are the
 * whole list, so the ones left out are deleted; `rules` keeps the actions that are left out.
 */
export type UpdateCollectionInput = Partial<CreateCollectionInput>;

/** An export file of collections, without records (`GET /api/collections/export`). */
export type CollectionExport = {
	format: 1;
	exportedAt: string;
	collections: CollectionSchema[];
	/** Collections relations point at that aren't in the file; an import finds them by name. */
	related: { id: string; name: string }[];
};

/** How bad a change is: `destructive` removes data. */
export type Severity = 'safe' | 'risky' | 'destructive';

/** The changes of an import or update, each with a description in words. */
export type ImportPlan = {
	steps: ({ kind: string; severity: Severity; description: string } & Record<string, unknown>)[];
	warnings: ({ kind: string; description: string } & Record<string, unknown>)[];
};

/** Options for `pb.collections.import()`. */
export type ImportOptions = {
	/** Also delete the collections the file doesn't have (built-in collections stay). */
	removeMissing?: boolean;
	/** Make changes that delete collections, fields or data; without it they fail with `409`. */
	force?: boolean;
	/** Only return the plan. */
	dryRun?: boolean;
	signal?: AbortSignal;
};

type CallOptions = { signal?: AbortSignal };

/**
 * The schema: collections, their fields, indexes and API rules (`/api/collections`). Every call
 * needs an API key with the `service` scope (`new Pouchbase(url, { apiKey })`), so only server-side
 * code, such as a deploy script, can change it.
 */
export class CollectionsService {
	readonly #pb: Pouchbase<object>;
	readonly #apiKey: string | undefined;

	constructor(pb: Pouchbase<object>, apiKey: string | undefined) {
		this.#pb = pb;
		this.#apiKey = apiKey;
	}

	/** Every collection with its fields, indexes, API rules and settings. */
	async list(options: CallOptions = {}): Promise<CollectionSchema[]> {
		const { items } = await this.#send<{ items: CollectionSchema[] }>('/api/collections', options);

		return items;
	}

	/** One collection; `null` when it doesn't exist. */
	async find(name: string, options: CallOptions = {}): Promise<CollectionSchema | null> {
		try {
			return await this.#send<CollectionSchema>(this.#path(name), options);
		} catch (error) {
			if (error instanceof PouchbaseError && error.status === 404) {
				return null;
			}

			throw error;
		}
	}

	/**
	 * Creates a collection with its fields, indexes and API rules.
	 *
	 * ```ts
	 * await pb.collections.create({
	 * 	name: 'posts',
	 * 	fields: [
	 * 		{ name: 'id', type: 'id', options: { generator: 'random' } },
	 * 		{ name: 'title', type: 'text', required: true }
	 * 	],
	 * 	rules: { list: '', view: '' }
	 * });
	 * ```
	 *
	 * @throws {PouchbaseError} `409` when the name is taken, `400` or `422` for invalid input.
	 */
	create(input: CreateCollectionInput, options: CallOptions = {}): Promise<CollectionSchema> {
		return this.#send('/api/collections', { ...options, method: 'POST', body: input });
	}

	/**
	 * Changes a collection: only the given parts. Changes that delete fields or data need
	 * `force: true`; without it they fail with `409` (the plan is in `error.data`).
	 */
	update(
		name: string,
		input: UpdateCollectionInput,
		options: CallOptions & { force?: boolean } = {}
	): Promise<CollectionSchema> {
		return this.#send(this.#path(name), {
			...options,
			method: 'PATCH',
			body: input,
			query: { force: options.force || undefined }
		});
	}

	/**
	 * Deletes a collection and its records.
	 * @throws {PouchbaseError} `403` for built-in collections, `409` while relations point to it.
	 */
	async remove(name: string, options: CallOptions = {}): Promise<void> {
		await this.#send(this.#path(name), { ...options, method: 'DELETE' });
	}

	/** An export file of every collection, or of the ones in `collections`. */
	export(options: CallOptions & { collections?: string[] } = {}): Promise<CollectionExport> {
		return this.#send('/api/collections/export', {
			...options,
			query: { collections: options.collections?.join(',') }
		});
	}

	/**
	 * Imports an export file: creates its collections and changes existing ones (matched by id,
	 * then by name) to match it. Other collections stay unless `removeMissing` is set.
	 *
	 * @throws {PouchbaseError} `409` for changes that delete data without `force`, `422` for
	 *   relations to collections this instance doesn't have or a change that failed.
	 */
	import(
		file: CollectionExport,
		options: ImportOptions = {}
	): Promise<{ applied: boolean; plan: ImportPlan }> {
		return this.#send('/api/collections/import', {
			signal: options.signal,
			method: 'POST',
			body: file,
			query: {
				removeMissing: options.removeMissing || undefined,
				force: options.force || undefined,
				dryRun: options.dryRun || undefined
			}
		});
	}

	#path(name: string) {
		return `/api/collections/${encodeURIComponent(name)}`;
	}

	#send<T>(
		path: string,
		options: CallOptions & {
			method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
			body?: unknown;
			query?: Record<string, string | boolean | undefined>;
		}
	): Promise<T> {
		if (!this.#apiKey) {
			return Promise.reject(
				new PouchbaseError(
					'Managing collections needs an API key with the service scope: new Pouchbase(url, { apiKey })',
					{ status: 401 }
				)
			);
		}

		return this.#pb.send<T>(path, {
			method: options.method,
			body: options.body,
			query: options.query,
			headers: { Authorization: `Bearer ${this.#apiKey}` },
			auth: false,
			signal: options.signal
		});
	}
}
