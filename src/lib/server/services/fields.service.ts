import type { ServiceError } from './base.service';
import type { FieldOptions, FieldType } from '#lib/fields/field-types.js';
import type { ResultAsync } from 'neverthrow';

import { and, asc, eq } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import {
	FIELD_NAME_PATTERN,
	FIELD_TYPES,
	isReservedFieldName,
	validateDefaultValue
} from '#lib/fields/field-types.js';

import { queryDatabase } from '../cloudflare/d1';
import { fields } from '../db';
import { Service } from './base.service';

export type Field = typeof fields.$inferSelect;

export type CreateFieldInput = {
	name: string;
	type: FieldType;
	required: boolean;
	unique: boolean;
	/** Empty or missing means no default. */
	defaultValue?: string;
	options: FieldOptions;
	/** Fields of built-in collections; they can't be renamed or deleted. */
	system?: boolean;
};

function isValidName(name: string) {
	return FIELD_NAME_PATTERN.test(name) && !isReservedFieldName(name);
}

function quote(value: string) {
	return `'${value.replaceAll("'", "''")}'`;
}

/** SQL literal for a (validated) default value. */
function defaultLiteral(type: FieldType, value: string) {
	switch (type) {
		case 'number':
			return String(Number(value));
		case 'integer':
			return String(Number.parseInt(value, 10));
		case 'boolean':
			return value === 'true' ? '1' : '0';
		case 'date':
			return quote(new Date(value).toISOString());
		case 'json':
			return quote(JSON.stringify(JSON.parse(value)));
		default:
			return quote(value);
	}
}

/** Column definition for `ALTER TABLE ... ADD COLUMN`. */
function columnSql(input: CreateFieldInput) {
	const parts = [`"${input.name}"`, FIELD_TYPES[input.type].column];

	if (input.defaultValue) {
		parts.push(`DEFAULT ${defaultLiteral(input.type, input.defaultValue)}`);
	}

	if (input.type === 'boolean') {
		parts.push(`CHECK ("${input.name}" IN (0, 1))`);
	}

	if (input.type === 'json' || (input.type === 'relation' && input.options.multiple)) {
		parts.push(`CHECK (json_valid("${input.name}"))`);
	}

	return parts.join(' ');
}

/** Named after the field id, so it survives renaming the field or the collection. */
export function uniqueIndexName(field: Pick<Field, 'id'>) {
	return `uq_${field.id.replaceAll('-', '')}`;
}

export class FieldsService extends Service {
	list(collectionId: string): ResultAsync<Field[], ServiceError<7000, 'LIST_FIELDS_FAILED'>> {
		return fromPromise(
			this.db
				.select()
				.from(fields)
				.where(eq(fields.collectionId, collectionId))
				.orderBy(asc(fields.createdAt)),
			(error) => this.error(7000, 'LIST_FIELDS_FAILED', error)
		);
	}

	/**
	 * Adds a column to the collection's table and registers the field.
	 *
	 * `required` is enforced when records are saved: SQLite can't add a NOT NULL column without a
	 * default to an existing table. `unique` becomes a UNIQUE INDEX, because ADD COLUMN can't be UNIQUE.
	 */
	create(
		collectionName: string,
		input: CreateFieldInput
	): ResultAsync<
		Field,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7001, 'INVALID_FIELD_NAME'>
		| ServiceError<7002, 'FIELD_ALREADY_EXISTS'>
		| ServiceError<7003, 'INVALID_DEFAULT_VALUE'>
		| ServiceError<7004, 'CREATE_FIELD_FAILED'>
		| ServiceError<7005, 'GET_FIELD_FAILED'>
		| ServiceError<7009, 'INVALID_RELATION'>
		| ServiceError<6010, 'GET_COLLECTION_BY_ID_FAILED'>
	> {
		if (!isValidName(input.name)) {
			return errAsync(this.error(7001, 'INVALID_FIELD_NAME'));
		}

		if (input.defaultValue && validateDefaultValue(input.type, input.defaultValue)) {
			return errAsync(this.error(7003, 'INVALID_DEFAULT_VALUE'));
		}

		if (input.type === 'relation' && !input.options.collectionId) {
			return errAsync(this.error(7009, 'INVALID_RELATION'));
		}

		const options: FieldOptions =
			input.type === 'rich_text'
				? { format: input.options.format ?? 'html' }
				: input.type === 'relation'
					? { collectionId: input.options.collectionId, multiple: input.options.multiple ?? false }
					: {};

		// A JSON array of ids can't meaningfully be unique.
		input = {
			...input,
			options,
			unique: input.unique && !(input.type === 'relation' && options.multiple)
		};

		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) => {
				if (input.type !== 'relation') {
					return okAsync(collection);
				}

				return this.services
					.collections()
					.getById(options.collectionId!)
					.andThen((target) =>
						target ? okAsync(collection) : errAsync(this.error(7009, 'INVALID_RELATION'))
					);
			})
			.andThen((collection) =>
				this.getByName(collection.id, input.name)
					.andThen((existing) =>
						existing ? errAsync(this.error(7002, 'FIELD_ALREADY_EXISTS')) : okAsync(undefined)
					)
					.andThen(() => this.services.database().requireApp())
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								const id = crypto.randomUUID();
								const table = `"${collection.name}"`;

								await queryDatabase(
									appDatabase.id,
									`ALTER TABLE ${table} ADD COLUMN ${columnSql(input)}`
								);

								if (input.unique) {
									try {
										await queryDatabase(
											appDatabase.id,
											`CREATE UNIQUE INDEX "${uniqueIndexName({ id })}" ON ${table} ("${input.name}")`
										);
									} catch (error) {
										// Keep the table and the field list in sync.
										await queryDatabase(
											appDatabase.id,
											`ALTER TABLE ${table} DROP COLUMN "${input.name}"`
										);
										throw error;
									}
								}

								const [field] = await this.db
									.insert(fields)
									.values({
										id,
										collectionId: collection.id,
										name: input.name,
										type: input.type,
										required: input.required,
										unique: input.unique,
										defaultValue: input.defaultValue || null,
										options,
										system: input.system ?? false
									})
									.returning();

								return field;
							})(),
							(error) => this.error(7004, 'CREATE_FIELD_FAILED', error)
						)
					)
			);
	}

	/** Renames the column; its CHECK constraint and unique index follow automatically. */
	rename(
		collectionName: string,
		name: string,
		newName: string
	): ResultAsync<
		Field,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7001, 'INVALID_FIELD_NAME'>
		| ServiceError<7002, 'FIELD_ALREADY_EXISTS'>
		| ServiceError<7005, 'GET_FIELD_FAILED'>
		| ServiceError<7006, 'FIELD_NOT_FOUND'>
		| ServiceError<7007, 'RENAME_FIELD_FAILED'>
		| ServiceError<7010, 'SYSTEM_FIELD'>
	> {
		if (!isValidName(newName)) {
			return errAsync(this.error(7001, 'INVALID_FIELD_NAME'));
		}

		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) =>
				this.requireByName(collection.id, name).andThen((field) => {
					if (field.system) {
						return errAsync(this.error(7010, 'SYSTEM_FIELD'));
					}

					if (newName === field.name) {
						return okAsync(field);
					}

					return this.getByName(collection.id, newName)
						.andThen((existing) =>
							existing ? errAsync(this.error(7002, 'FIELD_ALREADY_EXISTS')) : okAsync(undefined)
						)
						.andThen(() => this.services.database().requireApp())
						.andThen((appDatabase) =>
							fromPromise(
								(async () => {
									await queryDatabase(
										appDatabase.id,
										`ALTER TABLE "${collection.name}" RENAME COLUMN "${field.name}" TO "${newName}"`
									);

									const [renamed] = await this.db
										.update(fields)
										.set({ name: newName })
										.where(eq(fields.id, field.id))
										.returning();

									return renamed;
								})(),
								(error) => this.error(7007, 'RENAME_FIELD_FAILED', error)
							)
						);
				})
			);
	}

	/** Drops the column, including its data. */
	delete(
		collectionName: string,
		name: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7005, 'GET_FIELD_FAILED'>
		| ServiceError<7006, 'FIELD_NOT_FOUND'>
		| ServiceError<7008, 'DELETE_FIELD_FAILED'>
		| ServiceError<7010, 'SYSTEM_FIELD'>
	> {
		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) =>
				this.requireByName(collection.id, name).andThen((field) =>
					field.system
						? errAsync(this.error(7010, 'SYSTEM_FIELD'))
						: this.services
								.database()
								.requireApp()
								.andThen((appDatabase) =>
									fromPromise(
										(async () => {
											// SQLite can't drop a column that is part of an index, so drop every
											// index that uses it: its own unique index and custom indexes.
											const indexes = await queryDatabase(
												appDatabase.id,
												`SELECT DISTINCT il.name FROM pragma_index_list(?) AS il JOIN pragma_index_info(il.name) AS ii WHERE ii.name = ? AND il.origin != 'pk'`,
												[collection.name, field.name]
											);

											for (const [name] of indexes) {
												await queryDatabase(
													appDatabase.id,
													`DROP INDEX IF EXISTS "${String(name)}"`
												);
											}

											await queryDatabase(
												appDatabase.id,
												`ALTER TABLE "${collection.name}" DROP COLUMN "${field.name}"`
											);
											await this.db.delete(fields).where(eq(fields.id, field.id));
										})(),
										(error) => this.error(7008, 'DELETE_FIELD_FAILED', error)
									)
								)
				)
			);
	}

	private getByName(
		collectionId: string,
		name: string
	): ResultAsync<Field | null, ServiceError<7005, 'GET_FIELD_FAILED'>> {
		return fromPromise(
			this.db
				.select()
				.from(fields)
				.where(and(eq(fields.collectionId, collectionId), eq(fields.name, name))),
			(error) => this.error(7005, 'GET_FIELD_FAILED', error)
		).map(([field]) => field ?? null);
	}

	private requireByName(
		collectionId: string,
		name: string
	): ResultAsync<
		Field,
		ServiceError<7005, 'GET_FIELD_FAILED'> | ServiceError<7006, 'FIELD_NOT_FOUND'>
	> {
		return this.getByName(collectionId, name).andThen((field) =>
			field ? okAsync(field) : errAsync(this.error(7006, 'FIELD_NOT_FOUND'))
		);
	}
}
