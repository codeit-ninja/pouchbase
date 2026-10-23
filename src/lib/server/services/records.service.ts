import type { ErrorOf, ServiceError } from './base.service';
import type { Collection } from './collections.service';
import type { Field } from './fields.service';
import type { SignInMethod } from '#lib/auth/sign-in-methods.js';
import type { FieldOptions } from '#lib/fields/field-types.js';
import type { ApiRuleAction } from '#lib/filter/rules.js';
import type { RealtimeAction } from '#lib/realtime/protocol.js';
import type { SqlCondition } from '../filter';

import { asc, inArray } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync, ResultAsync } from 'neverthrow';

import { idGenerator, isAutoType, isRelationType, NOW_DEFAULT } from '#lib/fields/field-types.js';
import { sqlDefaultSelect } from '#lib/fields/sql-expression.js';
import { fileFieldRules } from '#lib/files/accept.js';
import { FilterError } from '#lib/filter/filter.js';
import { apiActions, protectedApiFields } from '#lib/filter/rules.js';

import { ComputeError, computedSpecs, createComputer, fillComputedColumns } from '../computed';
import { batchDatabase, queryDatabase, queryObjects } from '../db/query';
import { ALWAYS, both, compileFilter, compileRule, compileSort } from '../filter';
import { generateId } from '../crypto';
import { USERS_COLLECTION } from './auth.service';
import { FILES_COLLECTION } from '#lib/files/files.js';
import { parseThumbnailList, storageKeys } from './files.service';
import { inBackground } from './realtime.service';
import { collections, fields } from '../db';
import { Service } from './base.service';

export type RecordValue = string | number | null | RelationRef[];

/** A related record as shown in the grid: its id and a human readable label. */
export type RelationRef = { id: string; label: string };

/**
 * A record with a value per field. `_key` identifies it: the value of the ID field, or its `rowid`
 * when the collection has none. Field names start with a letter, so it never collides with one.
 */
export type RecordRow = { _key: string } & {
	[column: string]: RecordValue;
};

/**
 * The collection a relation field points to, the field used as the label of its records, and
 * its `id` and first `created` field. Without an `id` field its records can't be linked.
 */
type RelationTarget = {
	collection: Collection;
	label: string | null;
	id: string | null;
	created: string | null;
};

export type ListRecordsOptions = {
	page: number;
	perPage: number;
	sort?: string;
	order?: 'asc' | 'desc';
};

export type RecordPage = {
	fields: Field[];
	items: RecordRow[];
	total: number;
	page: number;
	perPage: number;
	sort: string;
	order: 'asc' | 'desc';
	/** Name of the collection each relation field points to, keyed by field name. */
	relationTargets: Record<string, string>;
	/** Only for the built-in `users` collection: how each user on this page can sign in. */
	signInMethods?: Record<string, SignInMethod[]>;
};

/** Field values as submitted by a form, keyed by field name. */
export type RecordInput = Record<string, unknown>;

/** Validation messages keyed by field name. */
export type RecordIssues = Record<string, string>;

type InvalidRecordError = ServiceError<8001, 'INVALID_RECORD'> & { data: { issues: RecordIssues } };
type UniqueViolationError = ServiceError<8002, 'UNIQUE_VIOLATION'> & { data: { field: string } };

type RecordContext = { collection: Collection; fields: Field[]; databaseId: string };

/**
 * Who calls the records API: the signed-in user (a row of `users`) or `null`. Record operations
 * that get an `access` check the collection's API rule for it; without one (the dashboard) every
 * record is reachable.
 */
export type ApiAccess = { auth: Record<string, unknown> | null };

/**
 * A record as the records API returns it: every field except blobs, with real values: booleans as
 * `true`/`false`, JSON fields parsed, and multiple relations, files and lists as arrays.
 */
export type ApiRecord = Record<string, unknown>;

export type ApiListOptions = {
	page: number;
	perPage: number;
	/** Fields to sort on: `-created_at,title` (`-` for descending). */
	sort?: string;
	/** A filter expression, see `#lib/filter/filter.ts`. */
	filter?: string;
	/** Only return these fields; all of them when missing. */
	fields?: string[];
	/** Relation fields to replace by their records: `author`, `comments.author` (see `expand()`). */
	expand?: string[];
};

/** What the records API returns of a record: `fields` limits the fields, `expand` relations. */
export type ApiReadOptions = { fields?: string[]; expand?: string[] };

/** Relation fields to expand by name, each with the fields to expand in its related records. */
type ExpandTree = Map<string, ExpandTree>;

export type ApiRecordList = {
	page: number;
	perPage: number;
	totalItems: number;
	totalPages: number;
	items: ApiRecord[];
};

type GuardError =
	| ServiceError<8013, 'ACTION_NOT_AVAILABLE'>
	| ServiceError<8014, 'RULE_LOCKED'>
	| (ServiceError<8016, 'INVALID_RULE'> & { data: { action: ApiRuleAction; message: string } })
	| InvalidRecordError;

type InvalidQueryError = ServiceError<8015, 'INVALID_QUERY'> & {
	data: { param: 'filter' | 'sort' | 'fields' | 'expand'; message: string };
};

type ExpandError =
	| ContextError
	| GuardError
	| InvalidQueryError
	| ServiceError<6010, 'GET_COLLECTION_BY_ID_FAILED'>
	| ServiceError<8018, 'EXPAND_RECORDS_FAILED'>;

type ContextError =
	| ServiceError<1004, 'APP_DATABASE_MISSING'>
	| ServiceError<5000, 'GET_SETTING_FAILED'>
	| ServiceError<6001, 'GET_COLLECTION_FAILED'>
	| ServiceError<6006, 'COLLECTION_NOT_FOUND'>;

/**
 * The last context read per collection name, cached per isolate so reads don't wait for it (see
 * `read()`). It is never trusted without checking: another isolate may have changed the schema.
 */
const contexts = new Map<string, RecordContext>();

/** D1 allows at most 100 bound parameters per statement (SQLite itself allows more). */
const MAX_IDS = 90;
/** How deep `expand` follows relations: `a.b.c`. */
const MAX_EXPAND_DEPTH = 3;
/** Field types whose value makes a good label for a related record, in order of preference. */
const LABEL_TYPES = new Set(['text', 'email', 'url']);

function isEmpty(value: unknown) {
	return value === undefined || value === null || value === '';
}

function parseIds(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(String).filter(Boolean);
	}

	if (typeof value !== 'string' || value === '') {
		return [];
	}

	if (value.startsWith('[')) {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
	}

	return [value];
}

/**
 * Converts a submitted value into what is stored in the column.
 *
 * @returns `{ value }` (`null` for an empty value) or `{ error }` with a message for the form.
 */
function parseValue(
	field: Field,
	raw: unknown
): { value: string | number | null } | { error: string } {
	if (field.type === 'boolean') {
		const checked = raw === true || raw === 'true' || raw === 'on' || raw === '1' || raw === 1;
		return { value: checked ? 1 : 0 };
	}

	if (isRelationType(field.type)) {
		let ids: string[];

		try {
			ids = parseIds(raw);
		} catch {
			return { error: 'Invalid selection' };
		}

		if (!ids.length) {
			return field.required ? { error: 'Required' } : { value: null };
		}

		return { value: field.options.multiple ? JSON.stringify(ids) : ids[0] };
	}

	if (field.type === 'list') {
		let selected: string[];

		try {
			selected = field.options.multiple
				? [...new Set(parseIds(raw))]
				: isEmpty(raw)
					? []
					: [String(raw)];
		} catch {
			return { error: 'Invalid selection' };
		}

		if (!selected.length) {
			return field.required ? { error: 'Required' } : { value: null };
		}

		const allowed = field.options.values ?? [];

		if (selected.some((value) => !allowed.includes(value))) {
			return { error: 'Choose an item from the list' };
		}

		// Stored in the order of the list, so the same selection always gives the same value.
		const ordered = allowed.filter((value) => selected.includes(value));

		return { value: field.options.multiple ? JSON.stringify(ordered) : ordered[0] };
	}

	if (isEmpty(raw)) {
		return field.required ? { error: 'Required' } : { value: null };
	}

	// The API may send JSON fields as values instead of JSON text.
	const text = field.type === 'json' && typeof raw !== 'string' ? JSON.stringify(raw) : String(raw);

	switch (field.type) {
		case 'number': {
			const number = Number(text);
			return Number.isFinite(number) ? { value: number } : { error: 'Enter a number' };
		}
		case 'integer': {
			const number = Number(text);
			return Number.isInteger(number) ? { value: number } : { error: 'Enter a whole number' };
		}
		case 'date': {
			// `datetime-local` inputs send no timezone; dates are stored and edited in UTC.
			const time = Date.parse(/T\d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text}Z` : text);
			return Number.isNaN(time)
				? { error: 'Enter a valid date' }
				: { value: new Date(time).toISOString() };
		}
		case 'email':
			return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
				? { value: text }
				: { error: 'Enter an email address' };
		case 'url':
			return URL.canParse(text)
				? { value: text }
				: { error: 'Enter a URL, e.g. https://example.com' };
		case 'json':
			try {
				return { value: JSON.stringify(JSON.parse(text)) };
			} catch {
				return { error: 'Enter valid JSON' };
			}
		default:
			return { value: text };
	}
}

/** Column SQLite reports in `UNIQUE constraint failed: <table>.<column>`, if any. */
function uniqueViolation(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.match(/UNIQUE constraint failed: [^.\s]+\.([a-z0-9_]+)/)?.[1] ?? null;
}

/** Columns a computed field's script can read: everything except blobs, which can be large. */
function readableColumns(collectionFields: Field[]) {
	return collectionFields.filter((field) => field.type !== 'blob').map((field) => field.name);
}

/**
 * The fields Pouchbase fills in: the `id` field (`null` when removed), and the timestamps set when
 * a record is created or saved. `key` is the column records are found by: the `id` field, or
 * SQLite's `rowid`.
 */
function autoFields(collectionFields: Field[]) {
	const idField = collectionFields.find((field) => field.type === 'id');
	const id = idField?.name ?? null;
	const names = (type: Field['type']) =>
		collectionFields.filter((field) => field.type === type).map((field) => field.name);

	return {
		id,
		generator: idField ? idGenerator(idField.options) : null,
		key: id ?? 'rowid',
		created: names('created'),
		updated: names('updated')
	};
}

/** Record keys as bound parameters; `rowid`s are integers, so other values can't match. */
function keyParams(key: string, ids: string[]) {
	return key === 'rowid' ? ids.map(Number).filter(Number.isSafeInteger) : ids;
}

/** A selected row (the key first, then every field) as a record. */
function toRecord(collectionFields: Field[], row: unknown[]) {
	return {
		...Object.fromEntries(collectionFields.map((field, index) => [field.name, row[index + 1]])),
		_key: String(row[0])
	} as RecordRow;
}

/** The fields the records API reads and filters on: all but blobs, which can be large. */
function apiFields(collectionFields: Field[]) {
	return collectionFields.filter((field) => field.type !== 'blob');
}

/** Whether a field holds a JSON array of values. */
function isMultiple(field: Field) {
	return (
		(field.type === 'relation' || field.type === 'file' || field.type === 'list') &&
		!!field.options.multiple
	);
}

/** A stored value as the records API returns it (see `ApiRecord`). */
function decodeValue(field: Field, value: unknown): unknown {
	if (value === null || value === undefined) {
		return isMultiple(field) ? [] : null;
	}

	if (field.type === 'boolean') {
		return Number(value) === 1;
	}

	if (field.type === 'json' || isMultiple(field)) {
		try {
			const parsed: unknown = JSON.parse(String(value));
			return isMultiple(field) && !Array.isArray(parsed) ? [parsed] : parsed;
		} catch {
			return isMultiple(field) ? [String(value)] : value;
		}
	}

	return value;
}

/** The fields the API returns: `names` (checked) or all readable ones. Throws a `FilterError`. */
function selectFields(readable: Field[], names: string[] | undefined) {
	if (!names?.length) {
		return readable;
	}

	for (const name of names) {
		if (!readable.some((field) => field.name === name)) {
			throw new FilterError(`Unknown field \`${name}\``);
		}
	}

	return readable.filter((field) => names.includes(field.name));
}

/**
 * `?expand=author,comments.author` as a tree of field names. Throws a `FilterError` for a path
 * that is empty or deeper than `MAX_EXPAND_DEPTH`.
 */
function parseExpand(paths: string[] | undefined): ExpandTree {
	const tree: ExpandTree = new Map();

	for (const path of paths ?? []) {
		const names = path.split('.').map((name) => name.trim());

		if (names.some((name) => !name)) {
			throw new FilterError(`Invalid path \`${path}\``);
		}

		if (names.length > MAX_EXPAND_DEPTH) {
			throw new FilterError(
				`\`${path}\` is too deep: relations can be expanded ${MAX_EXPAND_DEPTH} levels deep`
			);
		}

		let level = tree;

		for (const name of names) {
			let next = level.get(name);

			if (!next) {
				next = new Map();
				level.set(name, next);
			}

			level = next;
		}
	}

	return tree;
}

/**
 * `paths` (or a tree of them) as a tree, checking that every field of its first level is a
 * relation or file field of `readable`. Throws a `FilterError`.
 */
function expandTree(readable: Field[], paths: string[] | ExpandTree | undefined) {
	const tree = paths instanceof Map ? paths : parseExpand(paths);

	for (const name of tree.keys()) {
		const field = readable.find((field) => field.name === name);

		if (!field) {
			throw new FilterError(`Unknown field \`${name}\``);
		}

		if (!isRelationType(field.type)) {
			throw new FilterError(`\`${name}\` is not a relation or file field`);
		}
	}

	return tree;
}

/** The fields to select: `names` plus the fields to expand, or all of them without `names`. */
function withExpanded(names: string[] | undefined, tree: ExpandTree) {
	return names?.length ? [...new Set([...names, ...tree.keys()])] : names;
}

/** The ids in a decoded relation value: one id, an array of them, or none. */
function relatedIds(value: unknown) {
	if (Array.isArray(value)) {
		return value.map(String);
	}

	return value === null || value === undefined ? [] : [String(value)];
}

/** A row with the columns of `selected`, in order, as an API record. */
function toApiRecord(selected: Field[], row: unknown[]) {
	return Object.fromEntries(
		selected.map((field, index) => [field.name, decodeValue(field, row[index])])
	) as ApiRecord;
}

/** Stored values by field name as the records API returns the record, e.g. for realtime events. */
export function apiRecord(collectionFields: Field[], values: Record<string, unknown>) {
	const readable = apiFields(collectionFields);
	return toApiRecord(
		readable,
		readable.map((field) => values[field.name])
	);
}

/** What a write returns: the key, then the API fields, for its realtime event. */
function returning(key: string, collectionFields: Field[]) {
	return [`"${key}"`, ...apiFields(collectionFields).map((field) => `"${field.name}"`)].join(', ');
}

function columnExpression(field: Pick<Field, 'name' | 'type'>) {
	// Blobs can be large; the grid only needs their size.
	return field.type === 'blob' ? `length("${field.name}") AS "${field.name}"` : `"${field.name}"`;
}

export class RecordsService extends Service {
	/** One page of records, plus the fields (columns) of the collection. */
	list(
		collectionName: string,
		options: ListRecordsOptions
	): ResultAsync<
		RecordPage,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<8000, 'LIST_RECORDS_FAILED'>
	> {
		return this.read(
			collectionName,
			async ({ collection, fields: collectionFields, databaseId }) => {
				const { key, created } = autoFields(collectionFields);

				// Without fields the collection has no table yet.
				if (!collectionFields.length) {
					return {
						relationTargets: {},
						fields: collectionFields,
						items: [],
						total: 0,
						page: options.page,
						perPage: options.perPage,
						sort: key,
						order: 'desc'
					} satisfies RecordPage;
				}

				const sortable = collectionFields
					.filter((field) => field.type !== 'blob')
					.map((field) => field.name);
				const sort =
					options.sort && sortable.includes(options.sort) ? options.sort : (created[0] ?? key);
				const order = options.order === 'asc' ? 'asc' : 'desc';
				const columns = [`"${key}"`, ...collectionFields.map(columnExpression)];

				// The relation targets don't depend on the rows, so they're read at the same time.
				const [[[total], rows], targets] = await Promise.all([
					batchDatabase(databaseId, [
						{ sql: `SELECT count(*) FROM "${collection.name}"` },
						{
							sql: `SELECT ${columns.join(', ')} FROM "${collection.name}" ORDER BY "${sort}" ${order}, "${key}" ${order} LIMIT ? OFFSET ?`,
							params: [options.perPage, (options.page - 1) * options.perPage]
						}
					]),
					this.relationTargets(
						collectionFields
							.filter((field) => isRelationType(field.type) && field.options.collectionId)
							.map((field) => field.options.collectionId!)
					)
				]);

				const items = rows.map((row) => toRecord(collectionFields, row));

				const [relationTargets, signInMethods] = await Promise.all([
					this.resolveRelations(databaseId, collectionFields, items, targets),
					collection.system && collection.name === USERS_COLLECTION
						? this.signInMethods(
								databaseId,
								items.map((item) => item._key)
							)
						: undefined
				]);

				return {
					signInMethods,
					relationTargets,
					fields: collectionFields,
					items,
					total: Number(total?.[0] ?? 0),
					page: options.page,
					perPage: options.perPage,
					sort,
					order
				} satisfies RecordPage;
			},
			(error) => this.error(8000, 'LIST_RECORDS_FAILED', error)
		);
	}

	/**
	 * One record as shown in the grid (relations resolved to `{ id, label }`), e.g. to open a
	 * related record that isn't on the current page. `null` when it doesn't exist.
	 */
	get(
		collectionName: string,
		id: string
	): ResultAsync<
		{ item: RecordRow; signInMethods?: SignInMethod[] } | null,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<8011, 'GET_RECORD_FAILED'>
	> {
		return this.read(
			collectionName,
			async ({ collection, fields: collectionFields, databaseId }) => {
				const { key } = autoFields(collectionFields);

				if (!collectionFields.length) {
					return null;
				}

				const columns = [`"${key}"`, ...collectionFields.map(columnExpression)];

				// The relation targets don't depend on the row, so they're read at the same time.
				const [[row], targets] = await Promise.all([
					queryDatabase(
						databaseId,
						`SELECT ${columns.join(', ')} FROM "${collection.name}" WHERE "${key}" = ?`,
						keyParams(key, [id])
					),
					this.relationTargets(
						collectionFields
							.filter((field) => isRelationType(field.type) && field.options.collectionId)
							.map((field) => field.options.collectionId!)
					)
				]);

				if (!row) {
					return null;
				}

				const item = toRecord(collectionFields, row);
				const [, signInMethods] = await Promise.all([
					this.resolveRelations(databaseId, collectionFields, [item], targets),
					collection.system && collection.name === USERS_COLLECTION
						? this.signInMethods(databaseId, [item._key])
						: undefined
				]);

				return { item, signInMethods: signInMethods?.[item._key] };
			},
			(error) => this.error(8011, 'GET_RECORD_FAILED', error)
		);
	}

	/**
	 * One page of records for the records API, filtered by `options.filter` and by the collection's
	 * list rule: records the rule doesn't match are left out. Without `access` (an API key with the
	 * service scope), the rule isn't checked. `options.expand` replaces relations by their records
	 * (see `expand()`).
	 */
	apiList(
		collectionName: string,
		options: ApiListOptions,
		access: ApiAccess | undefined
	): ResultAsync<ApiRecordList, ExpandError | ServiceError<8000, 'LIST_RECORDS_FAILED'>> {
		return this.context(collectionName).andThen((context) =>
			this.guard(context, 'list', access).andThen((rule) => {
				const { collection, fields: collectionFields, databaseId } = context;
				const readable = apiFields(collectionFields);
				const { key, created } = autoFields(collectionFields);

				// Without fields the collection has no table yet.
				if (!collectionFields.length) {
					return okAsync({ ...options, totalItems: 0, totalPages: 0, items: [] });
				}

				return this.compileQuery('filter', () =>
					options.filter?.trim()
						? both(rule, compileFilter(options.filter, readable, access ?? { auth: null }))
						: rule
				).andThen((where) =>
					this.compileQuery('sort', () => compileSort(options.sort ?? '', readable))
						.andThen((sort) =>
							this.compileQuery('expand', () => expandTree(readable, options.expand)).map(
								(tree) => ({ sort, tree })
							)
						)
						.andThen(({ sort, tree }) =>
							this.compileQuery('fields', () =>
								selectFields(readable, withExpanded(options.fields, tree))
							).map((selected) => ({ sort, tree, selected }))
						)
						.andThen(({ sort, tree, selected }) => {
							// Without a sort, records come in the order they were created.
							const order = [
								...(sort.length ? sort : [`"${created[0] ?? key}" ASC`]),
								`"${key}" ASC`
							];
							const columns = selected.map((field) => `"${field.name}"`).join(', ');

							return fromPromise(
								batchDatabase(databaseId, [
									{
										sql: `SELECT count(*) FROM "${collection.name}" WHERE ${where.sql}`,
										params: where.params
									},
									{
										sql: `SELECT ${columns} FROM "${collection.name}" WHERE ${where.sql} ORDER BY ${order.join(', ')} LIMIT ? OFFSET ?`,
										params: [...where.params, options.perPage, (options.page - 1) * options.perPage]
									}
								]),
								(error) => this.error(8000, 'LIST_RECORDS_FAILED', error)
							)
								.map(([[total], rows]) => {
									const totalItems = Number(total?.[0] ?? 0);

									return {
										page: options.page,
										perPage: options.perPage,
										totalItems,
										totalPages: Math.ceil(totalItems / options.perPage),
										items: rows.map((row) => toApiRecord(selected, row))
									} satisfies ApiRecordList;
								})
								.andThen((list) =>
									this.expand(collectionFields, list.items, tree, access).map(() => list)
								);
						})
				);
			})
		);
	}

	/**
	 * One record for the records API; `null` when it doesn't exist or the collection's view rule
	 * doesn't match it. Without `access`, the rule isn't checked. `fields` limits the fields and
	 * `expand` replaces relations by their records (see `expand()`).
	 */
	apiGet(
		collectionName: string,
		id: string,
		options: ApiReadOptions & { access?: ApiAccess } = {}
	): ResultAsync<ApiRecord | null, ExpandError | ServiceError<8011, 'GET_RECORD_FAILED'>> {
		return this.readApiRecord(collectionName, id, options, options.access, options.access);
	}

	/** Creates a record through the records API (see `create`) and returns it (see `apiGet`). */
	apiCreate(
		collectionName: string,
		input: RecordInput,
		access: ApiAccess | undefined,
		options: ApiReadOptions = {}
	): ResultAsync<
		ApiRecord,
		| ErrorOf<ReturnType<RecordsService['create']>>
		| ErrorOf<ReturnType<RecordsService['apiGet']>>
		| ServiceError<8003, 'RECORD_NOT_FOUND'>
	> {
		return this.create(collectionName, input, { access }).andThen(({ id }) =>
			this.found(collectionName, id, options, access)
		);
	}

	/**
	 * Updates the fields in `input` of a record through the records API (see `update`) and returns
	 * the record (see `apiGet`).
	 */
	apiUpdate(
		collectionName: string,
		id: string,
		input: RecordInput,
		access: ApiAccess | undefined,
		options: ApiReadOptions = {}
	): ResultAsync<
		ApiRecord,
		ErrorOf<ReturnType<RecordsService['update']>> | ErrorOf<ReturnType<RecordsService['apiGet']>>
	> {
		return this.update(collectionName, id, input, { partial: true, access }).andThen(() =>
			this.found(collectionName, id, options, access)
		);
	}

	/** Records of a collection to pick from in a relation field. */
	listOptions(
		collectionId: string
	): ResultAsync<
		RelationRef[],
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<8007, 'LIST_OPTIONS_FAILED'>
	> {
		return this.services
			.database()
			.requireApp()
			.andThen((appDatabase) =>
				fromPromise(
					(async () => {
						const target = await this.relationTarget(collectionId);

						if (!target?.id) {
							return [];
						}

						const rows = await queryDatabase(
							appDatabase.id,
							`SELECT "${target.id}", "${target.label ?? target.id}" FROM "${target.collection.name}" ORDER BY "${target.created ?? 'rowid'}" DESC LIMIT 200`
						);

						return rows.map(([id, label]) => ({ id: String(id), label: String(label ?? id) }));
					})(),
					(error) => this.error(8007, 'LIST_OPTIONS_FAILED', error)
				)
			);
	}

	/**
	 * The fields the record form can upload a new file for: `file` fields, such as the `avatar` of
	 * users, and single relation fields that point to the built-in `files` collection.
	 */
	fileFields(
		collectionName: string
	): ResultAsync<
		{ name: string; accept: string[]; maxSize: number }[],
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<8008, 'LIST_FILE_FIELDS_FAILED'>
	> {
		return this.context(collectionName).andThen(({ fields: collectionFields }) =>
			fromPromise(
				(async () => {
					const found: { name: string; accept: string[]; maxSize: number }[] = [];

					for (const field of collectionFields) {
						if (field.type === 'file') {
							found.push({ name: field.name, ...fileFieldRules(field.options) });
							continue;
						}

						if (field.type !== 'relation' || field.options.multiple) {
							continue;
						}

						const target = await this.relationTarget(field.options.collectionId);

						if (target?.collection.system && target.collection.name === FILES_COLLECTION) {
							found.push({ name: field.name, ...fileFieldRules({}) });
						}
					}

					return found;
				})(),
				(error) => this.error(8008, 'LIST_FILE_FIELDS_FAILED', error)
			)
		);
	}

	/**
	 * Creates a record. With `access` (the records API), the collection's create rule must allow
	 * it; the rule sees the new record's values.
	 */
	create(
		collectionName: string,
		input: RecordInput,
		options: { access?: ApiAccess } = {}
	): ResultAsync<
		{ id: string },
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| InvalidRecordError
		| UniqueViolationError
		| ServiceError<8004, 'CREATE_RECORD_FAILED'>
		| ServiceError<8012, 'NO_FIELDS'>
		| ServiceError<8017, 'RULE_DENIED'>
		| GuardError
	> {
		return this.context(collectionName).andThen((context) => {
			const { collection, fields: collectionFields, databaseId } = context;

			return this.guard(context, 'create', options.access, input).andThen((condition) =>
				this.requireFields(collectionFields, this.error(8012, 'NO_FIELDS'))
					.andThen(() =>
						this.validate(databaseId, collectionFields, input, 8004, 'CREATE_RECORD_FAILED')
					)
					.andThen((values) => this.sqlDefaults(databaseId, collectionFields, values))
					.andThen((values) => {
						const auto = autoFields(collectionFields);
						const now = Date.now();
						const filled: Record<string, string | number> = Object.fromEntries(
							[...auto.created, ...auto.updated].map((name) => [name, now])
						);
						// `autoincrement` ids are assigned by the database.
						const id = auto.generator && generateId(auto.generator);

						if (auto.id && id) {
							filled[auto.id] = id;
						}

						for (const field of collectionFields) {
							if (
								field.type === 'date' &&
								field.defaultValue === NOW_DEFAULT &&
								values[field.name] === null
							) {
								filled[field.name] = new Date(now).toISOString();
							}
						}

						return this.compute(
							collection.name,
							collectionFields,
							{ ...values, ...filled },
							null,
							8004,
							'CREATE_RECORD_FAILED'
						).map((computed) => ({ key: auto.key, values: { ...values, ...filled, ...computed } }));
					})
					.andThen(({ key, values }) => {
						// Empty values are left out, so the column's DEFAULT applies.
						const entries = Object.entries(values).filter(([, value]) => value !== null);
						const columns = entries.map(([name]) => `"${name}"`).join(', ');

						if (condition === ALWAYS) {
							const insert = entries.length
								? `(${columns}) VALUES (${entries.map(() => '?').join(', ')})`
								: 'DEFAULT VALUES';

							return fromPromise(
								queryDatabase(
									databaseId,
									`INSERT INTO "${collection.name}" ${insert} RETURNING ${returning(key, collectionFields)}`,
									entries.map(([, value]) => value)
								),
								(error) => this.writeError(error, 8004, 'CREATE_RECORD_FAILED')
							).map((rows) => {
								this.announce(collection.name, 'create', collectionFields, rows);
								return { id: String(rows[0][0]) };
							});
						}

						// The rule runs on the new record: a row with every field's value, which is only
						// inserted when it matches, in the same statement.
						const row = apiFields(collectionFields).map((field) => field.name);
						const target = entries.length ? `(${columns})` : '("rowid")';
						const selected = entries.length ? columns : 'NULL';

						return fromPromise(
							queryDatabase(
								databaseId,
								`INSERT INTO "${collection.name}" ${target} SELECT ${selected} FROM (SELECT ${row.map((name) => `? AS "${name}"`).join(', ')}) WHERE ${condition.sql} RETURNING ${returning(key, collectionFields)}`,
								[...row.map((name) => values[name] ?? null), ...condition.params]
							),
							(error) => this.writeError(error, 8004, 'CREATE_RECORD_FAILED')
						).andThen((rows) => {
							if (!rows.length) {
								return errAsync(this.error(8017, 'RULE_DENIED'));
							}

							this.announce(collection.name, 'create', collectionFields, rows);

							return okAsync({ id: String(rows[0][0]) });
						});
					})
			);
		});
	}

	/**
	 * Updates a record. With `partial`, only the fields present in `input` are written; otherwise
	 * missing fields are cleared. With `access` (the records API), the collection's update rule
	 * must match the stored record, or it counts as not found.
	 */
	update(
		collectionName: string,
		id: string,
		input: RecordInput,
		options: { partial?: boolean; access?: ApiAccess } = {}
	): ResultAsync<
		{ id: string },
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| InvalidRecordError
		| UniqueViolationError
		| ServiceError<8003, 'RECORD_NOT_FOUND'>
		| ServiceError<8005, 'UPDATE_RECORD_FAILED'>
		| GuardError
	> {
		return this.context(collectionName).andThen((context) => {
			const { collection, fields: collectionFields, databaseId } = context;

			return this.guard(context, 'update', options.access, input).andThen((condition) =>
				this.requireFields(collectionFields, this.error(8003, 'RECORD_NOT_FOUND'))
					.andThen(() =>
						this.validate(
							databaseId,
							options.partial
								? collectionFields.filter((field) => field.name in input)
								: collectionFields,
							input,
							8005,
							'UPDATE_RECORD_FAILED'
						)
					)
					.andThen((values) => {
						const now = Date.now();
						const updated = Object.fromEntries(
							autoFields(collectionFields).updated.map((name) => [name, now])
						);

						if (!computedSpecs(collectionFields).length) {
							return okAsync({ values: { ...updated, ...values } });
						}

						// Computed fields see the whole record: the stored one with this save's changes.
						return this.readRecord(databaseId, collection.name, collectionFields, id)
							.andThen((previous) =>
								previous ? okAsync(previous) : errAsync(this.error(8003, 'RECORD_NOT_FOUND'))
							)
							.andThen((previous) =>
								this.compute(
									collection.name,
									collectionFields,
									{ ...previous, ...updated, ...values },
									previous,
									8005,
									'UPDATE_RECORD_FAILED'
								)
							)
							.map((computed) => ({ values: { ...updated, ...values, ...computed } }));
					})
					.andThen(({ values }) => {
						const { key } = autoFields(collectionFields);
						const entries = Object.entries(values);
						const assignments = entries.map(([name]) => `"${name}" = ?`).join(', ');
						const where = `"${key}" = ? AND (${condition.sql})`;

						return fromPromise(
							queryDatabase(
								databaseId,
								// Nothing to write (no fields left to save): only check that the record exists.
								entries.length
									? `UPDATE "${collection.name}" SET ${assignments} WHERE ${where} RETURNING ${returning(key, collectionFields)}`
									: `SELECT "${key}" FROM "${collection.name}" WHERE ${where}`,
								[...entries.map(([, value]) => value), ...keyParams(key, [id]), ...condition.params]
							),
							(error) => this.writeError(error, 8005, 'UPDATE_RECORD_FAILED')
						).andThen((rows) => {
							if (!rows.length) {
								return errAsync(this.error(8003, 'RECORD_NOT_FOUND'));
							}

							if (entries.length) {
								this.announce(collection.name, 'update', collectionFields, rows);
							}

							return okAsync({ id });
						});
					})
			);
		});
	}

	/**
	 * Deletes records. With `access` (the records API), only those that match the collection's
	 * delete rule are deleted.
	 */
	delete(
		collectionName: string,
		ids: string[],
		options: { access?: ApiAccess } = {}
	): ResultAsync<
		{ deleted: number },
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<8006, 'DELETE_RECORDS_FAILED'>
		| GuardError
	> {
		const unique = [...new Set(ids)].slice(0, MAX_IDS);

		if (!unique.length) {
			return okAsync({ deleted: 0 });
		}

		return this.context(collectionName).andThen((context) => {
			const { collection, fields: collectionFields, databaseId } = context;

			return this.guard(context, 'delete', options.access).andThen((condition) =>
				fromPromise(
					(async () => {
						const { key } = autoFields(collectionFields);

						if (!collectionFields.length) {
							return { deleted: 0 };
						}

						const isFiles = collection.system && collection.name === FILES_COLLECTION;
						const stored = isFiles
							? await queryDatabase(
									databaseId,
									`SELECT "id", "key", "thumbnails" FROM "files" WHERE "id" IN (${unique.map(() => '?').join(', ')})`,
									unique
								)
							: [];
						const params = keyParams(key, unique);
						const rows = params.length
							? await queryDatabase(
									databaseId,
									`DELETE FROM "${collection.name}" WHERE "${key}" IN (${params.map(() => '?').join(', ')}) AND (${condition.sql}) RETURNING ${returning(key, collectionFields)}`,
									[...params, ...condition.params]
								)
							: [];
						const deleted = rows.map(([id]) => String(id));

						this.announce(collection.name, 'delete', collectionFields, rows);
						const placeholders = deleted.map(() => '?').join(', ');

						// Deleted users lose their linked provider accounts too.
						if (deleted.length && collection.system && collection.name === USERS_COLLECTION) {
							await batchDatabase(databaseId, [
								{
									sql: `DELETE FROM "_external_auths" WHERE "user_id" IN (${placeholders})`,
									params: deleted
								},
								{
									sql: `DELETE FROM "_passwords" WHERE "user_id" IN (${placeholders})`,
									params: deleted
								}
							]);
						}

						// Deleted files are removed from storage too (the original and every stored
						// thumbnail); leftovers don't break anything.
						const keys = stored
							.filter(([id]) => deleted.includes(String(id)))
							.flatMap(([, key, thumbnails]) =>
								storageKeys({ key: String(key), thumbnails: parseThumbnailList(thumbnails) })
							);

						if (keys.length) {
							await this.services.storage().delete(keys);
						}

						return { deleted: deleted.length };
					})(),
					(error) => this.error(8006, 'DELETE_RECORDS_FAILED', error)
				)
			);
		});
	}

	/**
	 * Runs a computed field's calculation on the newest records without saving anything, so a
	 * script can be tried out. `error` is set when the script doesn't compile.
	 */
	previewComputed(
		collectionName: string,
		options: FieldOptions
	): ResultAsync<
		{ error?: string; rows: { id: string; value?: string | null; error?: string }[] },
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<8010, 'PREVIEW_COMPUTED_FAILED'>
	> {
		return this.context(collectionName).andThen(
			({ collection, fields: collectionFields, databaseId }) =>
				fromPromise(
					(async () => {
						// Field names can't start with `_`, so this never shadows a real field.
						const [spec] = computedSpecs([
							...collectionFields,
							{ name: '_preview', type: 'computed', options }
						]).filter((candidate) => candidate.name === '_preview');

						if (!spec) {
							return { error: 'Choose a source field or write a script', rows: [] };
						}

						let computer;

						try {
							computer = await createComputer(collection.name, [spec]);
						} catch (error) {
							if (error instanceof ComputeError) {
								return { error: error.message, rows: [] };
							}

							throw error;
						}

						try {
							const { key, created } = autoFields(collectionFields);
							const columns = readableColumns(collectionFields).map((name) => `"${name}"`);
							// Field names can't start with `_`, so the alias never shadows a column.
							const rows = await queryObjects(
								databaseId,
								`SELECT ${[`"${key}" AS "_key"`, ...columns].join(', ')} FROM "${collection.name}" ORDER BY "${created[0] ?? key}" DESC LIMIT 5`
							);

							return {
								rows: rows.map(({ _key, ...row }) => {
									try {
										return { id: String(_key), value: computer.compute(row, row)._preview };
									} catch (error) {
										if (error instanceof ComputeError) {
											return { id: String(_key), error: error.message };
										}

										throw error;
									}
								})
							};
						} finally {
							computer.dispose();
						}
					})(),
					(error) => this.error(8010, 'PREVIEW_COMPUTED_FAILED', error)
				)
		);
	}

	/**
	 * Recalculates the computed fields of records that were written without this service, such as
	 * users created by a sign-up or uploaded files.
	 */
	refreshComputed(
		collectionName: string,
		ids: string[]
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<8009, 'REFRESH_COMPUTED_FAILED'>
	> {
		return this.context(collectionName).andThen(
			({ collection, fields: collectionFields, databaseId }) =>
				fromPromise(
					// Lenient: these rows are already saved, so a failing script leaves its field empty.
					fillComputedColumns(
						databaseId,
						collection.name,
						readableColumns(collectionFields),
						computedSpecs(collectionFields),
						{ ids, key: autoFields(collectionFields).key, lenient: true }
					),
					(error) => this.error(8009, 'REFRESH_COMPUTED_FAILED', error)
				)
		);
	}

	/**
	 * Sends the realtime events of records that another service wrote directly, such as sign-ups
	 * and uploads. Best effort: it never fails, so callers run it with `inBackground()`.
	 */
	announceStored(
		collectionName: string,
		action: 'create' | 'update',
		ids: string[]
	): ResultAsync<void, never> {
		return this.context(collectionName)
			.andThen(({ collection, fields: collectionFields, databaseId }) => {
				const { key } = autoFields(collectionFields);
				const params = keyParams(key, ids);

				if (!collectionFields.length || !params.length) {
					return okAsync(undefined);
				}

				return fromPromise(
					queryDatabase(
						databaseId,
						`SELECT ${returning(key, collectionFields)} FROM "${collection.name}" WHERE "${key}" IN (${params.map(() => '?').join(', ')})`,
						params
					),
					(error) => this.error(8011, 'GET_RECORD_FAILED', error)
				).map((rows) => {
					this.announce(collection.name, action, collectionFields, rows);
				});
			})
			.orElse((failure) => {
				console.error('[realtime] could not read the changed records', failure);
				return okAsync(undefined);
			});
	}

	/**
	 * Sends the realtime events of written rows (the key, then the API fields; see `returning()`)
	 * in the background: the write never waits for them.
	 */
	private announce(
		collectionName: string,
		action: RealtimeAction,
		collectionFields: Field[],
		rows: unknown[][]
	) {
		if (!rows.length) {
			return;
		}

		const readable = apiFields(collectionFields);
		const at = Date.now();

		inBackground(
			this.services.realtime().publish(
				rows.map(([id, ...values]) => ({
					collection: collectionName,
					action,
					id: String(id),
					row: Object.fromEntries(readable.map((field, index) => [field.name, values[index]])),
					at
				}))
			)
		);
	}

	/**
	 * Values of the computed fields for a record about to be saved. A failing script becomes a
	 * form issue on its field.
	 */
	private compute<Code extends number, Message extends string>(
		collectionName: string,
		collectionFields: Field[],
		record: Record<string, unknown>,
		previous: Record<string, unknown> | null,
		failureCode: Code,
		failureMessage: Message
	): ResultAsync<Record<string, string | null>, InvalidRecordError | ServiceError<Code, Message>> {
		const specs = computedSpecs(collectionFields);

		if (!specs.length) {
			return okAsync({});
		}

		return fromPromise(
			(async () => {
				const computer = await createComputer(collectionName, specs);

				try {
					return computer.compute(record, previous);
				} finally {
					computer.dispose();
				}
			})(),
			(error): InvalidRecordError | ServiceError<Code, Message> =>
				error instanceof ComputeError
					? {
							code: 8001,
							message: 'INVALID_RECORD',
							data: { issues: { [error.field]: error.message } }
						}
					: this.error(failureCode, failureMessage, error)
		);
	}

	/** A stored record with every column a script can read; `null` when it doesn't exist. */
	private readRecord(
		databaseId: string,
		table: string,
		collectionFields: Field[],
		id: string
	): ResultAsync<Record<string, unknown> | null, ServiceError<8005, 'UPDATE_RECORD_FAILED'>> {
		const { key } = autoFields(collectionFields);
		const columns = readableColumns(collectionFields).map((name) => `"${name}"`);

		return fromPromise(
			queryObjects(
				databaseId,
				`SELECT ${columns.join(', ')} FROM "${table}" WHERE "${key}" = ?`,
				keyParams(key, [id])
			),
			(error) => this.error(8005, 'UPDATE_RECORD_FAILED', error)
		).map(([row]) => row ?? null);
	}

	/**
	 * Fills the empty fields whose default value is a SQL expression, evaluated on the app database
	 * in one query. The results are checked like submitted values; a bad result becomes a form
	 * issue on its field.
	 */
	private sqlDefaults(
		databaseId: string,
		collectionFields: Field[],
		values: Record<string, string | number | null>
	): ResultAsync<
		Record<string, string | number | null>,
		InvalidRecordError | ServiceError<8004, 'CREATE_RECORD_FAILED'>
	> {
		const defaulted = collectionFields.filter(
			(field) => field.options.defaultSql && field.defaultValue && values[field.name] === null
		);

		if (!defaulted.length) {
			return okAsync(values);
		}

		return fromPromise(
			queryDatabase(
				databaseId,
				`SELECT ${defaulted.map((field) => sqlDefaultSelect(field.type, field.defaultValue!)).join(', ')}`
			),
			(error) => this.error(8004, 'CREATE_RECORD_FAILED', error)
		).andThen(([row]) => {
			const filled = { ...values };
			const issues: RecordIssues = {};

			for (const [index, field] of defaulted.entries()) {
				const parsed = parseValue(field, row?.[index]);

				if ('error' in parsed) {
					issues[field.name] = `The default value gave an invalid value: ${parsed.error}`;
				} else {
					filled[field.name] = parsed.value;
				}
			}

			return Object.keys(issues).length
				? errAsync<never, InvalidRecordError>({
						code: 8001,
						message: 'INVALID_RECORD',
						data: { issues }
					})
				: okAsync(filled);
		});
	}

	/**
	 * Expands the relations in `expand` of `records` of a collection in place, as `?expand=` does
	 * (see `expand()`), for realtime events. Without records it only checks `expand`: every path
	 * must be a chain of relations to collections whose view rule `access` may use.
	 */
	apiExpand(
		collectionName: string,
		records: ApiRecord[],
		expand: string[],
		access: ApiAccess | undefined
	): ResultAsync<void, ExpandError> {
		return this.context(collectionName).andThen(({ fields: collectionFields }) =>
			this.compileQuery('expand', () => expandTree(apiFields(collectionFields), expand)).andThen(
				(tree) => this.expand(collectionFields, records, tree, access)
			)
		);
	}

	/**
	 * A record that was just written, as the API returns it, whatever its view rule; the records it
	 * links to only when their view rules let `access` see them.
	 */
	private found(
		collectionName: string,
		id: string,
		options: ApiReadOptions,
		access: ApiAccess | undefined
	): ResultAsync<
		ApiRecord,
		ErrorOf<ReturnType<RecordsService['apiGet']>> | ServiceError<8003, 'RECORD_NOT_FOUND'>
	> {
		return this.readApiRecord(collectionName, id, options, undefined, access).andThen((record) =>
			record ? okAsync(record) : errAsync(this.error(8003, 'RECORD_NOT_FOUND'))
		);
	}

	/**
	 * One record as the records API returns it, or `null`. The view rule of the record is checked
	 * for `viewer`, those of the records it expands for `access` (neither when `undefined`).
	 */
	private readApiRecord(
		collectionName: string,
		id: string,
		options: ApiReadOptions,
		viewer: ApiAccess | undefined,
		access: ApiAccess | undefined
	): ResultAsync<ApiRecord | null, ExpandError | ServiceError<8011, 'GET_RECORD_FAILED'>> {
		return this.context(collectionName).andThen((context) =>
			this.guard(context, 'view', viewer).andThen((rule) => {
				const { collection, fields: collectionFields, databaseId } = context;
				const readable = apiFields(collectionFields);
				const { key } = autoFields(collectionFields);

				if (!collectionFields.length) {
					return okAsync(null);
				}

				return this.compileQuery('expand', () => expandTree(readable, options.expand)).andThen(
					(tree) =>
						this.compileQuery('fields', () =>
							selectFields(readable, withExpanded(options.fields, tree))
						).andThen((selected) =>
							fromPromise(
								queryDatabase(
									databaseId,
									`SELECT ${selected.map((field) => `"${field.name}"`).join(', ')} FROM "${collection.name}" WHERE "${key}" = ? AND (${rule.sql})`,
									[...keyParams(key, [id]), ...rule.params]
								),
								(error) => this.error(8011, 'GET_RECORD_FAILED', error)
							).andThen(([row]) => {
								if (!row) {
									return okAsync(null);
								}

								const record = toApiRecord(selected, row);

								return this.expand(collectionFields, [record], tree, access).map(() => record);
							})
						)
				);
			})
		);
	}

	/**
	 * Replaces the relation fields in `tree` of `records` (of a collection with `collectionFields`)
	 * by the records they point to, as the API returns them, and expands those in turn. A single
	 * relation becomes a record or `null`, a multiple one an array of records. With `access`, only
	 * related records that the view rule of their collection matches are included; fails when the
	 * API doesn't show records of that collection at all.
	 */
	private expand(
		collectionFields: Field[],
		records: ApiRecord[],
		tree: ExpandTree,
		access: ApiAccess | undefined
	): ResultAsync<void, ExpandError> {
		// Without records, every level is still checked.
		if (!tree.size) {
			return okAsync(undefined);
		}

		return ResultAsync.combine(
			[...tree].map(([name, subtree]) => {
				const field = collectionFields.find((field) => field.name === name)!;

				return this.services
					.collections()
					.getById(field.options.collectionId ?? '')
					.andThen((target) =>
						target
							? this.context(target.name).andThen((context) =>
									this.related(context, records, name, subtree, access)
								)
							: okAsync(new Map<string, ApiRecord>())
					)
					.map((related) => {
						for (const record of records) {
							const found = relatedIds(record[name]).flatMap((id) => related.get(id) ?? []);

							record[name] = isMultiple(field) ? found : (found[0] ?? null);
						}
					});
			})
		).map(() => undefined);
	}

	/**
	 * The records of `context` that field `name` of `records` points to, by id and expanded by
	 * `subtree`: only those its view rule lets `access` see.
	 */
	private related(
		context: RecordContext,
		records: ApiRecord[],
		name: string,
		subtree: ExpandTree,
		access: ApiAccess | undefined
	): ResultAsync<Map<string, ApiRecord>, ExpandError> {
		const { collection, fields: collectionFields, databaseId } = context;
		const readable = apiFields(collectionFields);
		const { id: idColumn } = autoFields(collectionFields);
		const ids = [...new Set(records.flatMap((record) => relatedIds(record[name])))];

		return this.guard(context, 'view', access)
			.mapErr((error): ExpandError =>
				error.code === 8013 || error.code === 8014
					? {
							...this.error(8015, 'INVALID_QUERY'),
							data: {
								param: 'expand',
								message: `the API doesn't show records of \`${collection.name}\`, so \`${name}\` can't be expanded`
							}
						}
					: error
			)
			.andThen((rule) =>
				this.compileQuery('expand', () => expandTree(readable, subtree)).map(() => rule)
			)
			.andThen((rule) => {
				if (!idColumn || !ids.length) {
					return this.expand(collectionFields, [], subtree, access).map(
						() => new Map<string, ApiRecord>()
					);
				}

				// Every statement binds the rule's parameters as well as the ids.
				const size = Math.max(MAX_IDS - rule.params.length, 1);
				const chunks: string[][] = [];

				for (let start = 0; start < ids.length; start += size) {
					chunks.push(ids.slice(start, start + size));
				}

				const columns = readable.map((field) => `"${field.name}"`).join(', ');

				return fromPromise(
					batchDatabase(
						databaseId,
						chunks.map((chunk) => ({
							sql: `SELECT ${columns} FROM "${collection.name}" WHERE "${idColumn}" IN (${chunk.map(() => '?').join(', ')}) AND (${rule.sql})`,
							params: [...chunk, ...rule.params]
						}))
					),
					(error) => this.error(8018, 'EXPAND_RECORDS_FAILED', error)
				).andThen((results) => {
					const found = results.flat().map((row) => toApiRecord(readable, row));

					return this.expand(collectionFields, found, subtree, access).map(
						() => new Map(found.map((record) => [String(record[idColumn]), record]))
					);
				});
			});
	}

	/**
	 * The SQL condition of the collection's API rule for `action`, for a request with `access`;
	 * without `access` (the dashboard), every record. Fails when the API doesn't offer the action
	 * for this collection, when the rule is locked or invalid, or when `input` writes a protected
	 * field.
	 */
	private guard(
		{ collection, fields: collectionFields }: RecordContext,
		action: ApiRuleAction,
		access: ApiAccess | undefined,
		input?: RecordInput
	): ResultAsync<SqlCondition, GuardError> {
		if (!access) {
			return okAsync(ALWAYS);
		}

		if (!apiActions(collection).includes(action)) {
			return errAsync(this.error(8013, 'ACTION_NOT_AVAILABLE'));
		}

		const written = protectedApiFields(collection).filter((name) => input && name in input);

		if (written.length) {
			return errAsync<never, InvalidRecordError>({
				code: 8001,
				message: 'INVALID_RECORD',
				data: {
					issues: Object.fromEntries(
						written.map((name) => [name, "Can't be changed through the records API"])
					)
				}
			});
		}

		let condition: SqlCondition | null;

		try {
			condition = compileRule(collection.settings.rules?.[action], apiFields(collectionFields), {
				auth: access.auth,
				body: input
			});
		} catch (error) {
			return errAsync({
				...this.error(8016, 'INVALID_RULE'),
				data: { action, message: error instanceof Error ? error.message : String(error) }
			});
		}

		return condition ? okAsync(condition) : errAsync(this.error(8014, 'RULE_LOCKED'));
	}

	/** Runs `compile` for a query parameter; a `FilterError` becomes an `INVALID_QUERY`. */
	private compileQuery<T>(
		param: 'filter' | 'sort' | 'fields' | 'expand',
		compile: () => T
	): ResultAsync<T, InvalidQueryError> {
		try {
			return okAsync(compile());
		} catch (error) {
			return errAsync({
				...this.error(8015, 'INVALID_QUERY'),
				data: {
					param,
					message: error instanceof FilterError ? error.message : `Invalid ${param}`
				}
			});
		}
	}

	/** Fails with `error` when the collection has no fields, and so no table yet. */
	private requireFields<E>(collectionFields: Field[], error: E): ResultAsync<void, E> {
		return collectionFields.length ? okAsync(undefined) : errAsync(error);
	}

	/** The collection, its fields and the app database id: what every record operation needs. */
	private context(collectionName: string): ResultAsync<RecordContext, ContextError> {
		return this.services
			.collections()
			.requireWithFields(collectionName)
			.andThen(({ collection, fields: collectionFields }) =>
				this.services
					.database()
					.requireApp()
					.map((appDatabase) => ({
						collection,
						fields: collectionFields,
						databaseId: appDatabase.id
					}))
			)
			.map((context) => {
				contexts.set(collectionName, context);
				return context;
			})
			.mapErr((error) => {
				contexts.delete(collectionName);
				return error;
			});
	}

	/**
	 * Runs `run` with the context, for reads only. When this isolate has read the context before,
	 * `run` starts right away with that one while the context is read again, so both take one
	 * round-trip together; if the schema changed in between, `run` is repeated with the new one.
	 */
	private read<T, E>(
		collectionName: string,
		run: (context: RecordContext) => Promise<T>,
		onError: (error: unknown) => E
	): ResultAsync<T, ContextError | E> {
		const cached = contexts.get(collectionName);

		if (!cached) {
			return this.context(collectionName).andThen((context) => fromPromise(run(context), onError));
		}

		// Settled right away, so a failure with an outdated schema is never an unhandled rejection.
		const early = run(cached).then(
			(value) => ({ ok: true as const, value }),
			(error: unknown) => ({ ok: false as const, error })
		);

		return this.context(collectionName).andThen((context) =>
			fromPromise(
				JSON.stringify(context) === JSON.stringify(cached)
					? early.then((result) => (result.ok ? result.value : Promise.reject(result.error)))
					: run(context),
				onError
			)
		);
	}

	/**
	 * Parses every field of the input and checks that related records exist.
	 * Blob fields are never written here.
	 */
	private validate<Code extends number, Message extends string>(
		databaseId: string,
		collectionFields: Field[],
		input: RecordInput,
		failureCode: Code,
		failureMessage: Message
	): ResultAsync<
		Record<string, string | number | null>,
		InvalidRecordError | ServiceError<Code, Message>
	> {
		const values: Record<string, string | number | null> = {};
		const issues: RecordIssues = {};

		for (const field of collectionFields) {
			if (field.type === 'blob' || field.type === 'computed' || isAutoType(field.type)) {
				continue;
			}

			const parsed = parseValue(field, input[field.name]);

			if ('error' in parsed) {
				issues[field.name] = parsed.error;
			} else {
				values[field.name] = parsed.value;
			}
		}

		const relations = collectionFields.filter(
			(field) => isRelationType(field.type) && values[field.name] !== null && !issues[field.name]
		);

		return fromPromise(
			(async () => {
				for (const field of relations) {
					const target = await this.relationTarget(field.options.collectionId);
					const ids = parseIds(values[field.name]);

					if (!target) {
						issues[field.name] = 'The related collection no longer exists';
						continue;
					}

					if (!target.id) {
						issues[field.name] = 'The related collection has no id field';
						continue;
					}

					const found = await queryDatabase(
						databaseId,
						`SELECT "${target.id}" FROM "${target.collection.name}" WHERE "${target.id}" IN (${ids.map(() => '?').join(', ')})`,
						ids
					);

					if (found.length !== new Set(ids).size) {
						issues[field.name] = 'A selected record no longer exists';
					}
				}
			})(),
			(error) => this.error(failureCode, failureMessage, error)
		).andThen(() =>
			Object.keys(issues).length
				? errAsync<never, InvalidRecordError>({
						code: 8001,
						message: 'INVALID_RECORD',
						data: { issues }
					})
				: okAsync(values)
		);
	}

	private writeError<Code extends number, Message extends string>(
		error: unknown,
		code: Code,
		message: Message
	): UniqueViolationError | ServiceError<Code, Message> {
		const field = uniqueViolation(error);

		return field
			? { code: 8002, message: 'UNIQUE_VIOLATION', data: { field } }
			: this.error(code, message, error);
	}

	/** The related collection and the field used as its label. Throws on database errors. */
	private async relationTarget(collectionId: string | undefined) {
		return collectionId
			? ((await this.relationTargets([collectionId])).get(collectionId) ?? null)
			: null;
	}

	/**
	 * The related collections and their label fields, by collection id, read in one round-trip.
	 * Collections that don't exist are left out. Throws on database errors.
	 */
	private async relationTargets(collectionIds: string[]) {
		const targets = new Map<string, RelationTarget>();
		const ids = [...new Set(collectionIds)];

		if (!ids.length) {
			return targets;
		}

		const [targetCollections, targetFields] = await this.db.batch([
			this.db.select().from(collections).where(inArray(collections.id, ids)),
			this.db
				.select({ collectionId: fields.collectionId, name: fields.name, type: fields.type })
				.from(fields)
				.where(inArray(fields.collectionId, ids))
				.orderBy(asc(fields.position), asc(fields.createdAt))
		]);

		for (const collection of targetCollections) {
			const own = targetFields.filter((field) => field.collectionId === collection.id);
			const named = (match: (type: Field['type']) => boolean) =>
				own.find((field) => match(field.type))?.name ?? null;

			targets.set(collection.id, {
				collection,
				label: named((type) => LABEL_TYPES.has(type)),
				id: named((type) => type === 'id'),
				created: named((type) => type === 'created')
			});
		}

		return targets;
	}

	/**
	 * Linked OAuth accounts and passwords of these users, read from the internal `_external_auths`
	 * and `_passwords` tables. Throws on database errors.
	 */
	private async signInMethods(databaseId: string, userIds: string[]) {
		const methods: Record<string, SignInMethod[]> = Object.fromEntries(
			userIds.map((id) => [id, []])
		);

		if (!userIds.length) {
			return methods;
		}

		const placeholders = userIds.map(() => '?').join(', ');
		const [linked, passwords] = await batchDatabase(databaseId, [
			{
				sql: `SELECT "user_id", "provider", "provider_id", "created_at" FROM "_external_auths" WHERE "user_id" IN (${placeholders}) ORDER BY "created_at"`,
				params: userIds
			},
			{
				sql: `SELECT "user_id", "updated_at" FROM "_passwords" WHERE "user_id" IN (${placeholders})`,
				params: userIds
			}
		]);

		for (const [userId, provider, providerId, createdAt] of linked) {
			methods[String(userId)]?.push({
				provider: String(provider) as SignInMethod['provider'],
				providerId: String(providerId),
				linkedAt: Number(createdAt)
			});
		}

		for (const [userId, updatedAt] of passwords) {
			methods[String(userId)]?.push({
				provider: 'password',
				providerId: null,
				linkedAt: Number(updatedAt)
			});
		}

		return methods;
	}

	/**
	 * Replaces relation ids in the rows with `{ id, label }` references, and returns the collection
	 * each relation field points to (`relationTargets`, see `relationTargets()`). Fields are resolved
	 * in parallel. Throws on database errors.
	 */
	private async resolveRelations(
		databaseId: string,
		collectionFields: Field[],
		rows: RecordRow[],
		relationTargets: Map<string, RelationTarget>
	) {
		const targets: Record<string, string> = {};
		const relationFields = collectionFields.filter((field) => isRelationType(field.type));

		await Promise.all(
			relationFields.map(async (field) => {
				const idsByRow = rows.map((row) => {
					try {
						return parseIds(row[field.name]);
					} catch {
						return [];
					}
				});
				const ids = [...new Set(idsByRow.flat())];
				const labels = new Map<string, string>();
				const target = relationTargets.get(field.options.collectionId ?? '');

				if (target) {
					targets[field.name] = target.collection.name;
				}

				if (target?.id && ids.length) {
					const { id: idColumn, label } = target;
					const chunks: string[][] = [];

					for (let start = 0; start < ids.length; start += MAX_IDS) {
						chunks.push(ids.slice(start, start + MAX_IDS));
					}

					const results = await batchDatabase(
						databaseId,
						chunks.map((chunk) => ({
							sql: `SELECT "${idColumn}", "${label ?? idColumn}" FROM "${target.collection.name}" WHERE "${idColumn}" IN (${chunk.map(() => '?').join(', ')})`,
							params: chunk
						}))
					);

					for (const [id, label] of results.flat()) {
						labels.set(String(id), String(label ?? id));
					}
				}

				rows.forEach((row, index) => {
					row[field.name] = idsByRow[index].map((id) => ({ id, label: labels.get(id) ?? id }));
				});
			})
		);

		return targets;
	}
}
