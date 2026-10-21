import type { ServiceError } from './base.service';
import type { Collection } from './collections.service';
import type { Field } from './fields.service';
import type { SignInMethod } from '#lib/auth/sign-in-methods.js';
import type { ResultAsync } from 'neverthrow';

import { asc, eq } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { queryDatabase } from '../cloudflare/d1';
import { generateRecordId } from '../crypto';
import { USERS_COLLECTION } from './auth.service';
import { collections, fields } from '../db';
import { Service } from './base.service';

export type RecordValue = string | number | null | RelationRef[];

/** A related record as shown in the grid: its id and a human readable label. */
export type RelationRef = { id: string; label: string };

export type RecordRow = { id: string; created_at: number; updated_at: number } & {
	[column: string]: RecordValue;
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
	/** Only for the built-in `users` collection: how each user on this page can sign in. */
	signInMethods?: Record<string, SignInMethod[]>;
};

/** Field values as submitted by a form, keyed by field name. */
export type RecordInput = Record<string, unknown>;

/** Validation messages keyed by field name. */
export type RecordIssues = Record<string, string>;

type InvalidRecordError = ServiceError<8001, 'INVALID_RECORD'> & { data: { issues: RecordIssues } };
type UniqueViolationError = ServiceError<8002, 'UNIQUE_VIOLATION'> & { data: { field: string } };

const SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at'];
/** D1 allows at most 100 bound parameters per statement. */
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

	if (field.type === 'relation') {
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

	if (isEmpty(raw)) {
		return field.required ? { error: 'Required' } : { value: null };
	}

	const text = String(raw);

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

/** Column D1 reports in `UNIQUE constraint failed: <table>.<column>`, if any. */
function uniqueViolation(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.match(/UNIQUE constraint failed: [^.\s]+\.([a-z0-9_]+)/)?.[1] ?? null;
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
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<8000, 'LIST_RECORDS_FAILED'>
	> {
		return this.context(collectionName).andThen(
			({ collection, fields: collectionFields, databaseId }) =>
				fromPromise(
					(async () => {
						const sortable = [
							...SYSTEM_COLUMNS,
							...collectionFields
								.filter((field) => field.type !== 'blob')
								.map((field) => field.name)
						];
						const sort =
							options.sort && sortable.includes(options.sort) ? options.sort : 'created_at';
						const order = options.order === 'asc' ? 'asc' : 'desc';
						const columns = [
							...SYSTEM_COLUMNS.map((name) => `"${name}"`),
							...collectionFields.map(columnExpression)
						];
						const names = [...SYSTEM_COLUMNS, ...collectionFields.map((field) => field.name)];

						const [[total], rows] = await Promise.all([
							queryDatabase(databaseId, `SELECT count(*) FROM "${collection.name}"`),
							queryDatabase(
								databaseId,
								`SELECT ${columns.join(', ')} FROM "${collection.name}" ORDER BY "${sort}" ${order}, "id" ${order} LIMIT ? OFFSET ?`,
								[options.perPage, (options.page - 1) * options.perPage]
							)
						]);

						const items = rows.map(
							(row) =>
								Object.fromEntries(names.map((name, index) => [name, row[index]])) as RecordRow
						);

						await this.resolveRelations(databaseId, collectionFields, items);

						const signInMethods =
							collection.system && collection.name === USERS_COLLECTION
								? await this.signInMethods(
										databaseId,
										items.map((item) => item.id)
									)
								: undefined;

						return {
							signInMethods,
							fields: collectionFields,
							items,
							total: Number(total?.[0] ?? 0),
							page: options.page,
							perPage: options.perPage,
							sort,
							order
						} satisfies RecordPage;
					})(),
					(error) => this.error(8000, 'LIST_RECORDS_FAILED', error)
				)
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

						if (!target) {
							return [];
						}

						const rows = await queryDatabase(
							appDatabase.id,
							`SELECT "id", ${target.label ? `"${target.label}"` : '"id"'} FROM "${target.collection.name}" ORDER BY "created_at" DESC LIMIT 200`
						);

						return rows.map(([id, label]) => ({ id: String(id), label: String(label ?? id) }));
					})(),
					(error) => this.error(8007, 'LIST_OPTIONS_FAILED', error)
				)
			);
	}

	create(
		collectionName: string,
		input: RecordInput
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
	> {
		return this.context(collectionName).andThen(
			({ collection, fields: collectionFields, databaseId }) =>
				this.validate(databaseId, collectionFields, input, 8004, 'CREATE_RECORD_FAILED').andThen(
					(values) => {
						const id = generateRecordId();
						const now = Date.now();
						// Empty values are left out, so the column's DEFAULT applies.
						const entries = Object.entries(values).filter(([, value]) => value !== null);
						const columns = ['id', 'created_at', 'updated_at', ...entries.map(([name]) => name)];
						const params = [id, now, now, ...entries.map(([, value]) => value)];

						return fromPromise(
							queryDatabase(
								databaseId,
								`INSERT INTO "${collection.name}" (${columns.map((name) => `"${name}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
								params
							),
							(error) => this.writeError(error, 8004, 'CREATE_RECORD_FAILED')
						).map(() => ({ id }));
					}
				)
		);
	}

	update(
		collectionName: string,
		id: string,
		input: RecordInput
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
	> {
		return this.context(collectionName).andThen(
			({ collection, fields: collectionFields, databaseId }) =>
				this.validate(databaseId, collectionFields, input, 8005, 'UPDATE_RECORD_FAILED').andThen(
					(values) => {
						const entries = Object.entries(values);
						const assignments = ['"updated_at" = ?', ...entries.map(([name]) => `"${name}" = ?`)];

						return fromPromise(
							queryDatabase(
								databaseId,
								`UPDATE "${collection.name}" SET ${assignments.join(', ')} WHERE "id" = ? RETURNING "id"`,
								[Date.now(), ...entries.map(([, value]) => value), id]
							),
							(error) => this.writeError(error, 8005, 'UPDATE_RECORD_FAILED')
						).andThen((rows) =>
							rows.length ? okAsync({ id }) : errAsync(this.error(8003, 'RECORD_NOT_FOUND'))
						);
					}
				)
		);
	}

	delete(
		collectionName: string,
		ids: string[]
	): ResultAsync<
		{ deleted: number },
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<8006, 'DELETE_RECORDS_FAILED'>
	> {
		const unique = [...new Set(ids)].slice(0, MAX_IDS);

		if (!unique.length) {
			return okAsync({ deleted: 0 });
		}

		return this.context(collectionName).andThen(({ collection, databaseId }) =>
			fromPromise(
				(async () => {
					const placeholders = unique.map(() => '?').join(', ');
					const rows = await queryDatabase(
						databaseId,
						`DELETE FROM "${collection.name}" WHERE "id" IN (${placeholders}) RETURNING "id"`,
						unique
					);

					// Deleted users lose their linked provider accounts too.
					if (collection.system && collection.name === USERS_COLLECTION) {
						await queryDatabase(
							databaseId,
							`DELETE FROM "_external_auths" WHERE "user_id" IN (${placeholders})`,
							unique
						);
						await queryDatabase(
							databaseId,
							`DELETE FROM "_passwords" WHERE "user_id" IN (${placeholders})`,
							unique
						);
					}

					return { deleted: rows.length };
				})(),
				(error) => this.error(8006, 'DELETE_RECORDS_FAILED', error)
			)
		);
	}

	/** The collection, its fields and the app database id: what every record operation needs. */
	private context(
		collectionName: string
	): ResultAsync<
		{ collection: Collection; fields: Field[]; databaseId: string },
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
	> {
		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) =>
				this.services
					.fields()
					.list(collection.id)
					.andThen((collectionFields) =>
						this.services
							.database()
							.requireApp()
							.map((appDatabase) => ({
								collection,
								fields: collectionFields,
								databaseId: appDatabase.id
							}))
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
			if (field.type === 'blob') {
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
			(field) => field.type === 'relation' && values[field.name] !== null && !issues[field.name]
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

					const found = await queryDatabase(
						databaseId,
						`SELECT "id" FROM "${target.collection.name}" WHERE "id" IN (${ids.map(() => '?').join(', ')})`,
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
		if (!collectionId) {
			return null;
		}

		const [collection] = await this.db
			.select()
			.from(collections)
			.where(eq(collections.id, collectionId));

		if (!collection) {
			return null;
		}

		const targetFields = await this.db
			.select({ name: fields.name, type: fields.type })
			.from(fields)
			.where(eq(fields.collectionId, collectionId))
			.orderBy(asc(fields.createdAt));

		return {
			collection,
			label: targetFields.find((field) => LABEL_TYPES.has(field.type))?.name ?? null
		};
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
		const [linked, passwords] = await Promise.all([
			queryDatabase(
				databaseId,
				`SELECT "user_id", "provider", "provider_id", "created_at" FROM "_external_auths" WHERE "user_id" IN (${placeholders}) ORDER BY "created_at"`,
				userIds
			),
			queryDatabase(
				databaseId,
				`SELECT "user_id", "updated_at" FROM "_passwords" WHERE "user_id" IN (${placeholders})`,
				userIds
			)
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

	/** Replaces relation ids in the rows with `{ id, label }` references. Throws on database errors. */
	private async resolveRelations(databaseId: string, collectionFields: Field[], rows: RecordRow[]) {
		for (const field of collectionFields.filter((field) => field.type === 'relation')) {
			const idsByRow = rows.map((row) => {
				try {
					return parseIds(row[field.name]);
				} catch {
					return [];
				}
			});
			const ids = [...new Set(idsByRow.flat())];
			const labels = new Map<string, string>();

			if (ids.length) {
				const target = await this.relationTarget(field.options.collectionId);

				if (target) {
					for (let start = 0; start < ids.length; start += MAX_IDS) {
						const chunk = ids.slice(start, start + MAX_IDS);
						const found = await queryDatabase(
							databaseId,
							`SELECT "id", ${target.label ? `"${target.label}"` : '"id"'} FROM "${target.collection.name}" WHERE "id" IN (${chunk.map(() => '?').join(', ')})`,
							chunk
						);

						for (const [id, label] of found) {
							labels.set(String(id), String(label ?? id));
						}
					}
				}
			}

			rows.forEach((row, index) => {
				row[field.name] = idsByRow[index].map((id) => ({ id, label: labels.get(id) ?? id }));
			});
		}
	}
}
