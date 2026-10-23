import type { ErrorOf, ServiceError } from './base.service';
import type { Collection } from './collections.service';
import type { Field } from './fields.service';
import type { SignInMethod } from '#lib/auth/sign-in-methods.js';
import type { FieldOptions } from '#lib/fields/field-types.js';
import type { ApiRuleAction } from '#lib/filter/rules.js';
import type { SqlCondition } from '../filter';
import type { ResultAsync } from 'neverthrow';

import { asc, inArray } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

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

/** A record as the records API returns it: the stored value of every field except blobs. */
export type ApiRecord = Record<string, string | number | null>;

export type ApiListOptions = {
	page: number;
	perPage: number;
	/** PocketBase syntax: `-created_at,title`. */
	sort?: string;
	/** A filter expression, see `#lib/filter/filter.ts`. */
	filter?: string;
};

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
	data: { param: 'filter' | 'sort'; message: string };
};

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

/** A selected row of `apiFields` as an API record. */
function toApiRecord(collectionFields: Field[], row: unknown[]) {
	return Object.fromEntries(
		apiFields(collectionFields).map((field, index) => [field.name, row[index] ?? null])
	) as ApiRecord;
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
	 * list rule: records the rule doesn't match are left out.
	 */
	apiList(
		collectionName: string,
		options: ApiListOptions,
		access: ApiAccess
	): ResultAsync<
		ApiRecordList,
		ContextError | GuardError | InvalidQueryError | ServiceError<8000, 'LIST_RECORDS_FAILED'>
	> {
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
						? both(rule, compileFilter(options.filter, readable, access))
						: rule
				).andThen((where) =>
					this.compileQuery('sort', () => compileSort(options.sort ?? '', readable)).andThen(
						(sort) => {
							// Without a sort, records come in the order they were created.
							const order = [
								...(sort.length ? sort : [`"${created[0] ?? key}" ASC`]),
								`"${key}" ASC`
							];
							const columns = readable.map((field) => `"${field.name}"`).join(', ');

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
							).map(([[total], rows]) => {
								const totalItems = Number(total?.[0] ?? 0);

								return {
									page: options.page,
									perPage: options.perPage,
									totalItems,
									totalPages: Math.ceil(totalItems / options.perPage),
									items: rows.map((row) => toApiRecord(collectionFields, row))
								} satisfies ApiRecordList;
							});
						}
					)
				);
			})
		);
	}

	/**
	 * One record for the records API; `null` when it doesn't exist or the collection's view rule
	 * doesn't match it. Without `access`, the rule isn't checked.
	 */
	apiGet(
		collectionName: string,
		id: string,
		access?: ApiAccess
	): ResultAsync<
		ApiRecord | null,
		ContextError | GuardError | ServiceError<8011, 'GET_RECORD_FAILED'>
	> {
		return this.context(collectionName).andThen((context) =>
			this.guard(context, 'view', access).andThen((rule) => {
				const { collection, fields: collectionFields, databaseId } = context;
				const { key } = autoFields(collectionFields);

				if (!collectionFields.length) {
					return okAsync(null);
				}

				const columns = apiFields(collectionFields).map((field) => `"${field.name}"`);

				return fromPromise(
					queryDatabase(
						databaseId,
						`SELECT ${columns.join(', ')} FROM "${collection.name}" WHERE "${key}" = ? AND (${rule.sql})`,
						[...keyParams(key, [id]), ...rule.params]
					),
					(error) => this.error(8011, 'GET_RECORD_FAILED', error)
				).map(([row]) => (row ? toApiRecord(collectionFields, row) : null));
			})
		);
	}

	/** Creates a record through the records API (see `create`) and returns it. */
	apiCreate(
		collectionName: string,
		input: RecordInput,
		access: ApiAccess
	): ResultAsync<
		ApiRecord,
		| ErrorOf<ReturnType<RecordsService['create']>>
		| ErrorOf<ReturnType<RecordsService['apiGet']>>
		| ServiceError<8003, 'RECORD_NOT_FOUND'>
	> {
		return this.create(collectionName, input, { access }).andThen(({ id }) =>
			this.found(collectionName, id)
		);
	}

	/**
	 * Updates the fields in `input` of a record through the records API (see `update`) and returns
	 * the record.
	 */
	apiUpdate(
		collectionName: string,
		id: string,
		input: RecordInput,
		access: ApiAccess
	): ResultAsync<
		ApiRecord,
		ErrorOf<ReturnType<RecordsService['update']>> | ErrorOf<ReturnType<RecordsService['apiGet']>>
	> {
		return this.update(collectionName, id, input, { partial: true, access }).andThen(() =>
			this.found(collectionName, id)
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
									`INSERT INTO "${collection.name}" ${insert} RETURNING "${key}"`,
									entries.map(([, value]) => value)
								),
								(error) => this.writeError(error, 8004, 'CREATE_RECORD_FAILED')
							).map(([[id]]) => ({ id: String(id) }));
						}

						// The rule runs on the new record: a row with every field's value, which is only
						// inserted when it matches, in the same statement.
						const row = apiFields(collectionFields).map((field) => field.name);
						const target = entries.length ? `(${columns})` : '("rowid")';
						const selected = entries.length ? columns : 'NULL';

						return fromPromise(
							queryDatabase(
								databaseId,
								`INSERT INTO "${collection.name}" ${target} SELECT ${selected} FROM (SELECT ${row.map((name) => `? AS "${name}"`).join(', ')}) WHERE ${condition.sql} RETURNING "${key}"`,
								[...row.map((name) => values[name] ?? null), ...condition.params]
							),
							(error) => this.writeError(error, 8004, 'CREATE_RECORD_FAILED')
						).andThen((rows) =>
							rows.length
								? okAsync({ id: String(rows[0][0]) })
								: errAsync(this.error(8017, 'RULE_DENIED'))
						);
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
									? `UPDATE "${collection.name}" SET ${assignments} WHERE ${where} RETURNING "${key}"`
									: `SELECT "${key}" FROM "${collection.name}" WHERE ${where}`,
								[...entries.map(([, value]) => value), ...keyParams(key, [id]), ...condition.params]
							),
							(error) => this.writeError(error, 8005, 'UPDATE_RECORD_FAILED')
						).andThen((rows) =>
							rows.length ? okAsync({ id }) : errAsync(this.error(8003, 'RECORD_NOT_FOUND'))
						);
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
									`DELETE FROM "${collection.name}" WHERE "${key}" IN (${params.map(() => '?').join(', ')}) AND (${condition.sql}) RETURNING "${key}"`,
									[...params, ...condition.params]
								)
							: [];
						const deleted = rows.map(([id]) => String(id));
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

	/** A record that was just written, as the API returns it. */
	private found(
		collectionName: string,
		id: string
	): ResultAsync<
		ApiRecord,
		ErrorOf<ReturnType<RecordsService['apiGet']>> | ServiceError<8003, 'RECORD_NOT_FOUND'>
	> {
		return this.apiGet(collectionName, id).andThen((record) =>
			record ? okAsync(record) : errAsync(this.error(8003, 'RECORD_NOT_FOUND'))
		);
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
		param: 'filter' | 'sort',
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
