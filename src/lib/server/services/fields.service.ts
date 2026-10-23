import type { ServiceError } from './base.service';
import type { FieldOptions, FieldType } from '#lib/fields/field-types.js';
import type { Result, ResultAsync } from 'neverthrow';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { err, errAsync, fromPromise, ok, okAsync } from 'neverthrow';

import {
	COMPUTED_SOURCE_TYPES,
	COMPUTED_TRANSFORMS,
	hasComputedSource,
	MAX_LIST_VALUE_LENGTH,
	MAX_LIST_VALUES,
	MAX_SCRIPT_LENGTH,
	FIELD_NAME_PATTERN,
	FIELD_TYPES,
	ID_GENERATORS,
	idGenerator,
	isAutoType,
	isReservedFieldName,
	NOW_DEFAULT,
	validateDefaultValue
} from '#lib/fields/field-types.js';
import {
	checkSqlExpression,
	SQL_DEFAULT_TYPES,
	sqlDefaultSelect
} from '#lib/fields/sql-expression.js';
import { fileFieldRules } from '#lib/files/accept.js';
import { MAX_FILE_SIZE } from '#lib/files/files.js';

import {
	ComputeError,
	computedSpecs,
	createComputer,
	fillComputedColumns,
	type ComputedSpec
} from '../computed';
import { generateId } from '../crypto';
import { queryDatabase, tableExists } from '../db/query';
import { collections, fields } from '../db';
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

/** Valid `accept` rules, and `maxSize` only when it is below the global upload limit. */
function fileOptions(options: FieldOptions): FieldOptions {
	const { accept, maxSize } = fileFieldRules(options);

	return maxSize < MAX_FILE_SIZE ? { accept, maxSize } : { accept };
}

/** Options of a list field, cleaned up; `null` when it has no valid items. */
function listOptions(options: FieldOptions): FieldOptions | null {
	const values = [...new Set((options.values ?? []).map((value) => String(value).trim()))].filter(
		Boolean
	);

	if (
		!values.length ||
		values.length > MAX_LIST_VALUES ||
		values.some((value) => value.length > MAX_LIST_VALUE_LENGTH)
	) {
		return null;
	}

	return { values, multiple: options.multiple ?? false };
}

/** Whether the field stores a JSON array: a relation or list that allows multiple values. */
function isMultiple(field: { type: FieldType; options: FieldOptions }) {
	return (field.type === 'relation' || field.type === 'list') && !!field.options.multiple;
}

/** Error for a computed field whose script or values failed, with a message for the form. */
type ComputeFailedError = ServiceError<7016, 'COMPUTE_FAILED'> & { data: { message: string } };

function isUniqueViolation(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes('UNIQUE constraint failed');
}

/** Columns a computed field's script can read: everything except blobs, which can be large. */
function readableColumns(collectionFields: Field[]) {
	return collectionFields.filter((field) => field.type !== 'blob').map((field) => field.name);
}

/** Options of a computed field, cleaned up; `null` when they are incomplete. */
function computedOptions(options: FieldOptions): FieldOptions | null {
	const { transform, source, script } = options;

	if (!transform || !Object.hasOwn(COMPUTED_TRANSFORMS, transform)) {
		return null;
	}

	if (hasComputedSource(transform)) {
		return source ? { transform, source } : null;
	}

	return script?.trim() && script.length <= MAX_SCRIPT_LENGTH ? { transform, script } : null;
}

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

/** Records given an id per query when an `id` field is added: 3 bound parameters each. */
const ID_FILL_SIZE = 30;

/** The column definition input for a stored field. */
function fieldInput(field: Field): CreateFieldInput {
	return { ...field, defaultValue: field.defaultValue ?? undefined };
}

/**
 * Column definition for `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` or a rebuilt table.
 *
 * @param options.nullableKey Leaves `NOT NULL` off a text `id` column, so a rebuilt table can be
 *   filled before the existing records get their id.
 */
function columnSql(input: CreateFieldInput, options: { nullableKey?: boolean } = {}) {
	if (input.type === 'id') {
		// AUTOINCREMENT: numbers of deleted records are never handed out again.
		return idGenerator(input.options) === 'autoincrement'
			? `"${input.name}" INTEGER PRIMARY KEY AUTOINCREMENT`
			: `"${input.name}" TEXT PRIMARY KEY${options.nullableKey ? '' : ' NOT NULL'}`;
	}

	const parts = [`"${input.name}"`, FIELD_TYPES[input.type].column];

	// `@now` and SQL expressions are filled in when a record is created: ADD COLUMN can't have a
	// non-constant DEFAULT.
	if (input.defaultValue && input.defaultValue !== NOW_DEFAULT && !input.options.defaultSql) {
		parts.push(
			input.type === 'list' && input.options.multiple
				? `DEFAULT ${quote(JSON.stringify([input.defaultValue]))}`
				: `DEFAULT ${defaultLiteral(input.type, input.defaultValue)}`
		);
	}

	if (input.type === 'boolean') {
		parts.push(`CHECK ("${input.name}" IN (0, 1))`);
	}

	if (input.type === 'json' || isMultiple(input)) {
		parts.push(`CHECK (json_valid("${input.name}"))`);
	}

	return parts.join(' ');
}

/** Named after the field id, so it survives renaming the field or the collection. */
export function uniqueIndexName(field: Pick<Field, 'id'>) {
	return `uq_${field.id.replaceAll('-', '')}`;
}

/** Edits to one field, as made in the edit collection sheet. */
export type FieldChange = {
	id: string;
	name: string;
	required: boolean;
	unique: boolean;
	/** Drops the field, including its data. */
	remove: boolean;
};

/** Error for removing an `id` field that relation fields still point to. */
type IdInUseError = ServiceError<7020, 'ID_FIELD_IN_USE'> & { data: { relations: string[] } };

/** Error for a default value expression that isn't allowed or doesn't run, with a message for the form. */
type InvalidDefaultExpressionError = ServiceError<7023, 'INVALID_DEFAULT_EXPRESSION'> & {
	data: { message: string };
};

/** A default value expression failed when it was tried out. */
class DefaultExpressionError extends Error {}

/** Turning off "multiple" would drop values: some records have more than one. */
class MultipleValuesError extends Error {}

/** List items can't be removed while records use them. */
class ListItemsInUseError extends Error {
	constructor(readonly items: string[]) {
		super('List items in use');
	}
}

/** The settings of a field that `FieldsService.update` changes. */
export type FieldSettings = {
	/** Empty or missing means no default. */
	defaultValue?: string;
	options: FieldOptions;
};

/** A unique index couldn't be created because records already share a value. */
class DuplicateValuesError extends Error {
	constructor(readonly fieldId: string) {
		super('Duplicate values');
	}
}

export class FieldsService extends Service {
	list(collectionId: string): ResultAsync<Field[], ServiceError<7000, 'LIST_FIELDS_FAILED'>> {
		return fromPromise(
			this.db
				.select()
				.from(fields)
				.where(eq(fields.collectionId, collectionId))
				.orderBy(asc(fields.position), asc(fields.createdAt)),
			(error) => this.error(7000, 'LIST_FIELDS_FAILED', error)
		);
	}

	/**
	 * Adds a column to the collection's table and registers the field. The first field of a
	 * collection creates its table; an `id` field rebuilds an existing table (see `addPrimaryKey`).
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
		| ServiceError<7011, 'INVALID_COMPUTED'>
		| ServiceError<6010, 'GET_COLLECTION_BY_ID_FAILED'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<7013, 'FILES_COLLECTION_UNAVAILABLE'>
		| ServiceError<7018, 'INVALID_LIST'>
		| ServiceError<7019, 'INVALID_FIELD_TYPE'>
		| ServiceError<7022, 'ID_FIELD_ALREADY_EXISTS'>
		| InvalidDefaultExpressionError
		| ComputeFailedError
	> {
		if (!Object.hasOwn(FIELD_TYPES, input.type)) {
			return errAsync(this.error(7019, 'INVALID_FIELD_TYPE'));
		}

		if (!isValidName(input.name)) {
			return errAsync(this.error(7001, 'INVALID_FIELD_NAME'));
		}

		if (input.type === 'relation' && !input.options.collectionId) {
			return errAsync(this.error(7009, 'INVALID_RELATION'));
		}

		if (input.type === 'computed' && !computedOptions(input.options)) {
			return errAsync(this.error(7011, 'INVALID_COMPUTED'));
		}

		const settings = this.settings(input.type, input.defaultValue, input.options);

		if (settings.isErr()) {
			return errAsync(settings.error);
		}

		const { options } = settings.value;
		const filled = input.type === 'computed' || isAutoType(input.type);

		input = {
			...input,
			options,
			// A JSON array can't meaningfully be unique, and every upload is a new file anyway.
			unique:
				input.unique &&
				!isMultiple({ type: input.type, options }) &&
				input.type !== 'file' &&
				!isAutoType(input.type),
			// Computed and automatic values are always filled in, so they can't be required.
			required: input.required && !filled,
			defaultValue: settings.value.defaultValue
		};

		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) => {
				// File fields always point to the built-in `files` collection, whatever was submitted.
				if (input.type === 'file') {
					return (
						this.services
							.files()
							.ensureFilesCollection()
							// Its own code: the files collection is itself set up with this method.
							.mapErr((cause) => ({
								...this.error(7013, 'FILES_COLLECTION_UNAVAILABLE'),
								data: cause
							}))
							.map((files) => {
								options.collectionId = files.id;
								return collection;
							})
					);
				}

				if (input.type !== 'relation') {
					return okAsync(collection);
				}

				// Relations store the related record's id, so the target needs an `id` field.
				return this.services
					.collections()
					.getById(options.collectionId!)
					.andThen((target) => (target ? this.list(target.id) : okAsync([])))
					.andThen((targetFields) =>
						targetFields.some((field) => field.type === 'id')
							? okAsync(collection)
							: errAsync(this.error(7009, 'INVALID_RELATION'))
					);
			})
			.andThen((collection) => {
				if (input.type !== 'id') {
					return okAsync(collection);
				}

				// The id field is the table's primary key, and a table has only one.
				return this.list(collection.id).andThen((collectionFields) =>
					collectionFields.some((field) => field.type === 'id')
						? errAsync(this.error(7022, 'ID_FIELD_ALREADY_EXISTS'))
						: okAsync(collection)
				);
			})
			.andThen((collection) => {
				if (input.type !== 'computed') {
					return okAsync({ collection, computed: null });
				}

				return this.list(collection.id).andThen((collectionFields) =>
					this.computedSpec(collectionFields, input.name, options).map((spec) => ({
						collection,
						computed: { spec, columns: readableColumns(collectionFields) }
					}))
				);
			})
			.andThen(({ collection, computed }) =>
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

								if (options.defaultSql) {
									await this.checkDefaultExpression(appDatabase.id, input);
								}

								// The first field creates the table: SQLite tables need at least one column.
								const created = !(await tableExists(appDatabase.id, collection.name));

								if (created) {
									await queryDatabase(
										appDatabase.id,
										`CREATE TABLE ${table} (${columnSql(input)})`
									);
								} else if (input.type === 'id') {
									await this.addPrimaryKey(appDatabase.id, collection, input);
								} else {
									await queryDatabase(
										appDatabase.id,
										`ALTER TABLE ${table} ADD COLUMN ${columnSql(input)}`
									);
								}

								// Keeps the table and the field list in sync when a later step fails.
								const undo = () =>
									queryDatabase(
										appDatabase.id,
										created
											? `DROP TABLE ${table}`
											: `ALTER TABLE ${table} DROP COLUMN "${input.name}"`
									);

								if (computed) {
									try {
										// Existing records get their value right away.
										await fillComputedColumns(appDatabase.id, collection.name, computed.columns, [
											computed.spec
										]);
									} catch (error) {
										await undo();
										throw error;
									}
								}

								if (input.unique) {
									try {
										await queryDatabase(
											appDatabase.id,
											`CREATE UNIQUE INDEX "${uniqueIndexName({ id })}" ON ${table} ("${input.name}")`
										);
									} catch (error) {
										await undo();
										throw error;
									}
								}

								// New fields go last.
								const [{ position }] = await this.db
									.select({ position: sql<number>`coalesce(max(${fields.position}), -1) + 1` })
									.from(fields)
									.where(eq(fields.collectionId, collection.id));

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
										system: input.system ?? false,
										position
									})
									.returning();

								return field;
							})(),
							(error) =>
								error instanceof ComputeError
									? this.computeFailed(error)
									: error instanceof DefaultExpressionError
										? this.invalidDefaultExpression(error.message)
										: this.error(7004, 'CREATE_FIELD_FAILED', error)
						)
					)
			);
	}

	/**
	 * Changes how a computed field is calculated and recalculates it for every record. When a
	 * record fails (a script error, or a duplicate value in a unique field), nothing is changed.
	 */
	updateComputed(
		collectionName: string,
		name: string,
		input: FieldOptions
	): ResultAsync<
		Field,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<7005, 'GET_FIELD_FAILED'>
		| ServiceError<7006, 'FIELD_NOT_FOUND'>
		| ServiceError<7011, 'INVALID_COMPUTED'>
		| ComputeFailedError
		| ServiceError<7017, 'UPDATE_COMPUTED_FAILED'>
	> {
		const options = computedOptions(input);

		if (!options) {
			return errAsync(this.error(7011, 'INVALID_COMPUTED'));
		}

		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) =>
				this.list(collection.id).andThen((collectionFields) => {
					const field = collectionFields.find((other) => other.name === name);

					if (!field || field.type !== 'computed') {
						return errAsync(this.error(7006, 'FIELD_NOT_FOUND'));
					}

					return this.computedSpec(collectionFields, name, options).andThen((spec) =>
						this.services
							.database()
							.requireApp()
							.andThen((appDatabase) =>
								fromPromise(
									(async () => {
										const columns = readableColumns(collectionFields);
										const previous = computedSpecs(collectionFields).filter(
											(other) => other.name === name
										);

										try {
											await fillComputedColumns(appDatabase.id, collection.name, columns, [spec]);
										} catch (error) {
											// Put the old values back; a failure here leaves empty values.
											await fillComputedColumns(
												appDatabase.id,
												collection.name,
												columns,
												previous,
												{ lenient: true }
											).catch(() => undefined);
											throw error;
										}

										const [updated] = await this.db
											.update(fields)
											.set({ options })
											.where(eq(fields.id, field.id))
											.returning();

										return updated;
									})(),
									(error) =>
										error instanceof ComputeError
											? this.computeFailed(error)
											: isUniqueViolation(error)
												? this.computeFailed(
														new ComputeError(name, 'Some records would get the same value')
													)
												: this.error(7017, 'UPDATE_COMPUTED_FAILED', error)
								)
							)
					);
				})
			);
	}

	/**
	 * Changes the settings of a field that depend on its type: its default value (also `@now` or a
	 * SQL expression), list items, accepted file types and size, rich text format, id generator,
	 * and whether a relation or list allows multiple values. The type, the related collection and
	 * a computation (see `updateComputed`) can't change here.
	 *
	 * When the column definition changes (its DEFAULT or CHECK), the table is rebuilt and records
	 * keep their data; a single value becomes a one-item array when "multiple" is turned on.
	 * Changes that would lose data are refused.
	 */
	update(
		collectionName: string,
		name: string,
		input: FieldSettings
	): ResultAsync<
		Field,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<7003, 'INVALID_DEFAULT_VALUE'>
		| ServiceError<7006, 'FIELD_NOT_FOUND'>
		| ServiceError<7010, 'SYSTEM_FIELD'>
		| ServiceError<7018, 'INVALID_LIST'>
		| ServiceError<7019, 'INVALID_FIELD_TYPE'>
		| InvalidDefaultExpressionError
		| ServiceError<7024, 'UNIQUE_MULTIPLE'>
		| ServiceError<7025, 'MULTIPLE_VALUES_IN_USE'>
		| (ServiceError<7026, 'LIST_ITEMS_IN_USE'> & { data: { items: string[] } })
		| ServiceError<7027, 'UPDATE_FIELD_FAILED'>
	> {
		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) =>
				this.list(collection.id).map((collectionFields) => ({ collection, collectionFields }))
			)
			.andThen(({ collection, collectionFields }) => {
				const field = collectionFields.find((candidate) => candidate.name === name);

				if (!field) {
					return errAsync(this.error(7006, 'FIELD_NOT_FOUND'));
				}

				if (field.system) {
					return errAsync(this.error(7010, 'SYSTEM_FIELD'));
				}

				// Computations have `updateComputed`; timestamps have no settings.
				if (field.type === 'computed' || field.type === 'created' || field.type === 'updated') {
					return errAsync(this.error(7019, 'INVALID_FIELD_TYPE'));
				}

				// An auto-increment id is an INTEGER column, the other generators make text.
				if (
					field.type === 'id' &&
					(idGenerator(field.options) === 'autoincrement') !==
						(input.options.generator === 'autoincrement')
				) {
					return errAsync(this.error(7019, 'INVALID_FIELD_TYPE'));
				}

				const settings = this.settings(field.type, input.defaultValue, {
					...input.options,
					// The related collection stays.
					collectionId: field.options.collectionId
				});

				if (settings.isErr()) {
					return errAsync(settings.error);
				}

				const next: Field = {
					...field,
					options: settings.value.options,
					defaultValue: settings.value.defaultValue ?? null
				};
				const wasMultiple = isMultiple(field);
				const multiple = isMultiple(next);

				// A JSON array can't meaningfully be unique (see `create`).
				if (multiple && field.unique) {
					return errAsync(this.error(7024, 'UNIQUE_MULTIPLE'));
				}

				const removedItems =
					field.type === 'list'
						? (field.options.values ?? []).filter((item) => !next.options.values?.includes(item))
						: [];

				return this.services
					.database()
					.requireApp()
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								const databaseId = appDatabase.id;
								const table = `"${collection.name}"`;
								const column = `"${field.name}"`;

								if (wasMultiple && !multiple) {
									const [crowded] = await queryDatabase(
										databaseId,
										`SELECT 1 FROM ${table} WHERE json_array_length(${column}) > 1 LIMIT 1`
									);

									if (crowded) {
										throw new MultipleValuesError();
									}
								}

								if (removedItems.length) {
									const placeholders = removedItems.map(() => '?').join(', ');
									const used = await queryDatabase(
										databaseId,
										wasMultiple
											? `SELECT DISTINCT "item"."value" FROM ${table}, json_each(${table}.${column}) AS "item" WHERE "item"."value" IN (${placeholders})`
											: `SELECT DISTINCT ${column} FROM ${table} WHERE ${column} IN (${placeholders})`,
										removedItems
									);

									if (used.length) {
										throw new ListItemsInUseError(used.map(([item]) => String(item)));
									}
								}

								if (next.options.defaultSql) {
									await this.checkDefaultExpression(databaseId, fieldInput(next));
								}

								if (columnSql(fieldInput(field)) !== columnSql(fieldInput(next))) {
									const source =
										multiple && !wasMultiple
											? `CASE WHEN ${column} IS NULL THEN NULL ELSE json_array(${column}) END`
											: wasMultiple && !multiple
												? `json_extract(${column}, '$[0]')`
												: column;

									await this.rebuildTable(
										databaseId,
										collection.name,
										collectionFields.map((other) =>
											other.id === field.id
												? {
														definition: columnSql(fieldInput(next)),
														name: other.name,
														source
													}
												: {
														definition: columnSql(fieldInput(other)),
														name: other.name,
														source: `"${other.name}"`
													}
										)
									);
								}

								const [updated] = await this.db
									.update(fields)
									.set({ defaultValue: next.defaultValue, options: next.options })
									.where(eq(fields.id, field.id))
									.returning();

								return updated;
							})(),
							(error) => {
								if (error instanceof DefaultExpressionError) {
									return this.invalidDefaultExpression(error.message);
								}

								if (error instanceof MultipleValuesError) {
									return this.error(7025, 'MULTIPLE_VALUES_IN_USE');
								}

								if (error instanceof ListItemsInUseError) {
									return {
										...this.error(7026, 'LIST_ITEMS_IN_USE'),
										data: { items: error.items }
									};
								}

								return this.error(7027, 'UPDATE_FIELD_FAILED', error);
							}
						)
					);
			});
	}

	/**
	 * Checks a computed field's options against the collection: the source must be a field whose
	 * value can be turned into text, and a script must compile.
	 */
	private computedSpec(
		collectionFields: Field[],
		name: string,
		options: FieldOptions
	): ResultAsync<ComputedSpec, ServiceError<7011, 'INVALID_COMPUTED'> | ComputeFailedError> {
		const transform = options.transform!;

		if (hasComputedSource(transform)) {
			const source = collectionFields.find((field) => field.name === options.source);

			return source && source.name !== name && COMPUTED_SOURCE_TYPES.has(source.type)
				? okAsync({ name, transform, source: { name: source.name, type: source.type } })
				: errAsync(this.error(7011, 'INVALID_COMPUTED'));
		}

		const spec: ComputedSpec = { name, transform, script: options.script };

		return fromPromise(
			createComputer('', [spec]).then((computer) => computer.dispose()),
			(error) =>
				error instanceof ComputeError
					? this.computeFailed(error)
					: this.computeFailed(new ComputeError(name, String(error)))
		).map(() => spec);
	}

	/**
	 * The options and default value of a field of this type, checked and cleaned up: only the
	 * options of the type are kept. Shared by `create` and `update`.
	 */
	private settings(
		type: FieldType,
		defaultValue: string | undefined,
		input: FieldOptions
	): Result<
		{ options: FieldOptions; defaultValue: string | undefined },
		| ServiceError<7003, 'INVALID_DEFAULT_VALUE'>
		| ServiceError<7018, 'INVALID_LIST'>
		| ServiceError<7019, 'INVALID_FIELD_TYPE'>
		| InvalidDefaultExpressionError
	> {
		if (type === 'id' && !Object.hasOwn(ID_GENERATORS, input.generator ?? '')) {
			return err(this.error(7019, 'INVALID_FIELD_TYPE'));
		}

		// Computed and automatic values are always filled in, so they have no default.
		if (type === 'computed' || isAutoType(type)) {
			defaultValue = undefined;
		}

		const defaultSql = !!input.defaultSql && !!defaultValue;

		if (defaultSql && !SQL_DEFAULT_TYPES.has(type)) {
			return err(this.error(7003, 'INVALID_DEFAULT_VALUE'));
		}

		const expressionError = defaultSql ? checkSqlExpression(defaultValue!) : null;

		if (expressionError) {
			return err(this.invalidDefaultExpression(expressionError));
		}

		if (!defaultSql && defaultValue && validateDefaultValue(type, defaultValue)) {
			return err(this.error(7003, 'INVALID_DEFAULT_VALUE'));
		}

		const list = type === 'list' ? listOptions(input) : null;

		if (type === 'list' && !list) {
			return err(this.error(7018, 'INVALID_LIST'));
		}

		if (list && defaultValue && !list.values!.includes(defaultValue)) {
			return err(this.error(7003, 'INVALID_DEFAULT_VALUE'));
		}

		const options: FieldOptions =
			type === 'rich_text'
				? { format: input.format ?? 'html' }
				: type === 'relation'
					? { collectionId: input.collectionId, multiple: input.multiple ?? false }
					: type === 'computed'
						? (computedOptions(input) ?? {})
						: type === 'file'
							? { ...fileOptions(input), collectionId: input.collectionId }
							: type === 'id'
								? { generator: input.generator }
								: (list ?? {});

		if (defaultSql) {
			options.defaultSql = true;
		}

		return ok({ options, defaultValue: defaultValue || undefined });
	}

	/**
	 * Evaluates a default expression once, so a typo or an unsupported function is reported when
	 * the field is added, not when records are created. Throws a `DefaultExpressionError`.
	 */
	private async checkDefaultExpression(databaseId: string, input: CreateFieldInput) {
		let value: unknown;

		try {
			[[value]] = await queryDatabase(
				databaseId,
				`SELECT ${sqlDefaultSelect(input.type, input.defaultValue!)}`
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			throw new DefaultExpressionError(`SQLite can't run this expression: ${message}`);
		}

		if (input.type === 'date' && value === null) {
			throw new DefaultExpressionError(
				"This expression doesn't give a date, e.g. use datetime('now', '+7 days')"
			);
		}
	}

	private invalidDefaultExpression(message: string): InvalidDefaultExpressionError {
		return { code: 7023, message: 'INVALID_DEFAULT_EXPRESSION', data: { message } };
	}

	private computeFailed(error: ComputeError): ComputeFailedError {
		return { code: 7016, message: 'COMPUTE_FAILED', data: { message: error.message } };
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
		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) =>
				this.requireByName(collection.id, name).andThen((field) => {
					if (field.system) {
						return errAsync(this.error(7010, 'SYSTEM_FIELD'));
					}

					if (!isValidName(newName)) {
						return errAsync(this.error(7001, 'INVALID_FIELD_NAME'));
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
							fromPromise(this.renameColumn(appDatabase.id, collection, field, newName), (error) =>
								this.error(7007, 'RENAME_FIELD_FAILED', error)
							)
						);
				})
			);
	}

	/**
	 * Drops the column, including its data.
	 *
	 * @param options.allowSystem Internal: lets built-in setup code remove an outdated system field.
	 */
	delete(
		collectionName: string,
		name: string,
		options: { allowSystem?: boolean } = {}
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
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| (ServiceError<7012, 'FIELD_IN_USE'> & { data: { computed: string[] } })
		| IdInUseError
	> {
		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) =>
				this.requireByName(collection.id, name).andThen((field) =>
					field.system && !options.allowSystem
						? errAsync(this.error(7010, 'SYSTEM_FIELD'))
						: this.requireUnused(collection.id, field.name)
								.andThen(() =>
									field.type === 'id' ? this.requireIdUnused(collection.id) : okAsync(undefined)
								)
								.andThen(() => this.services.database().requireApp())
								.andThen((appDatabase) =>
									fromPromise(this.removeColumn(appDatabase.id, collection, field), (error) =>
										this.error(7008, 'DELETE_FIELD_FAILED', error)
									)
								)
				)
			);
	}

	/**
	 * Applies all changes of the edit collection sheet in one go: removes, renames, `required` and
	 * `unique`, and the display order, which follows the order of `changes` (fields left out keep
	 * their order after them). System fields can only be moved. Removing the `id` field rebuilds
	 * the table; records keep their `rowid`. Removing every field drops the table.
	 *
	 * Unique indexes are created first, as that is the step most likely to fail (duplicate values).
	 */
	updateAll(
		collectionName: string,
		changes: FieldChange[]
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| (ServiceError<7001, 'INVALID_FIELD_NAME'> & { data: { id: string } })
		| (ServiceError<7002, 'FIELD_ALREADY_EXISTS'> & { data: { id: string } })
		| (ServiceError<7012, 'FIELD_IN_USE'> & { data: { computed: string[] } })
		| ServiceError<7014, 'UPDATE_FIELDS_FAILED'>
		| (ServiceError<7015, 'DUPLICATE_VALUES'> & { data: { id: string } })
		| IdInUseError
	> {
		return this.services
			.collections()
			.requireByName(collectionName)
			.andThen((collection) => this.list(collection.id).map((current) => ({ collection, current })))
			.andThen(({ collection, current }) => {
				const byId = new Map(current.map((field) => [field.id, field]));
				const listed = changes.filter((change) => byId.has(change.id));
				const listedIds = new Set(listed.map((change) => change.id));

				const planned = [
					...listed,
					...current
						.filter((field) => !listedIds.has(field.id))
						.map((field) => ({ ...field, remove: false }))
				].map((change) => {
					const field = byId.get(change.id)!;

					if (field.system) {
						return {
							field,
							name: field.name,
							required: field.required,
							unique: field.unique,
							remove: false
						};
					}

					// Same rules as `create`.
					const auto = isAutoType(field.type);

					return {
						field,
						name: change.name,
						required: change.required && field.type !== 'computed' && !auto,
						unique: change.unique && !isMultiple(field) && field.type !== 'file' && !auto,
						remove: change.remove
					};
				});

				const kept = planned.filter((plan) => !plan.remove);
				const removed = planned.filter((plan) => plan.remove);
				const names = new Set<string>();

				for (const plan of kept) {
					if (plan.name !== plan.field.name && !isValidName(plan.name)) {
						return errAsync({
							...this.error(7001, 'INVALID_FIELD_NAME'),
							data: { id: plan.field.id }
						});
					}

					if (names.has(plan.name)) {
						return errAsync({
							...this.error(7002, 'FIELD_ALREADY_EXISTS'),
							data: { id: plan.field.id }
						});
					}

					names.add(plan.name);
				}

				// Computed fields that stay can't lose their source.
				const removedNames = new Set(removed.map((plan) => plan.field.name));
				const computed = kept
					.filter(
						(plan) =>
							plan.field.type === 'computed' && removedNames.has(plan.field.options.source ?? '')
					)
					.map((plan) => plan.field.name);

				if (computed.length) {
					return errAsync({
						code: 7012 as const,
						message: 'FIELD_IN_USE' as const,
						data: { computed }
					});
				}

				const removedIds = removed.map((plan) => plan.field.id);

				return (
					removed.some((plan) => plan.field.type === 'id')
						? this.requireIdUnused(collection.id, removedIds)
						: okAsync(undefined)
				)
					.andThen(() => this.services.database().requireApp())
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								const table = `"${collection.name}"`;

								for (const plan of kept) {
									if (plan.unique && !plan.field.unique) {
										try {
											await queryDatabase(
												appDatabase.id,
												`CREATE UNIQUE INDEX "${uniqueIndexName(plan.field)}" ON ${table} ("${plan.field.name}")`
											);
										} catch {
											throw new DuplicateValuesError(plan.field.id);
										}
									}

									if (!plan.unique && plan.field.unique) {
										await queryDatabase(
											appDatabase.id,
											`DROP INDEX IF EXISTS "${uniqueIndexName(plan.field)}"`
										);
									}
								}

								for (const plan of removed) {
									await this.removeColumn(appDatabase.id, collection, plan.field);
								}

								// When a new name is still taken by another field (e.g. two names swapped),
								// rename through temporary names. Field names can't start with `_`.
								const renamed = kept.filter((plan) => plan.name !== plan.field.name);
								const currentNames = new Set(kept.map((plan) => plan.field.name));
								const swap = renamed.some((plan) => currentNames.has(plan.name));
								const temporary = (field: Field) => `_tmp_${field.id.replaceAll('-', '')}`;

								if (swap) {
									for (const plan of renamed) {
										await this.renameColumn(
											appDatabase.id,
											collection,
											plan.field,
											temporary(plan.field)
										);
									}
								}

								for (const plan of renamed) {
									await this.renameColumn(
										appDatabase.id,
										collection,
										swap ? { ...plan.field, name: temporary(plan.field) } : plan.field,
										plan.name
									);
								}

								for (const [position, plan] of kept.entries()) {
									await this.db
										.update(fields)
										.set({ required: plan.required, unique: plan.unique, position })
										.where(eq(fields.id, plan.field.id));
								}
							})(),
							(error) =>
								error instanceof DuplicateValuesError
									? { ...this.error(7015, 'DUPLICATE_VALUES'), data: { id: error.fieldId } }
									: this.error(7014, 'UPDATE_FIELDS_FAILED', error)
						)
					);
			});
	}

	/**
	 * Renames the column and the field; computed fields follow their source to the new name.
	 * Throws on database errors.
	 */
	private async renameColumn(
		databaseId: string,
		collection: { id: string; name: string },
		field: Field,
		newName: string
	) {
		await queryDatabase(
			databaseId,
			`ALTER TABLE "${collection.name}" RENAME COLUMN "${field.name}" TO "${newName}"`
		);

		const [renamed] = await this.db
			.update(fields)
			.set({ name: newName })
			.where(eq(fields.id, field.id))
			.returning();

		const computed = await this.db
			.select()
			.from(fields)
			.where(and(eq(fields.collectionId, collection.id), eq(fields.type, 'computed')));

		for (const dependent of computed) {
			if (dependent.options.source === field.name) {
				await this.db
					.update(fields)
					.set({ options: { ...dependent.options, source: newName } })
					.where(eq(fields.id, dependent.id));
			}
		}

		return renamed;
	}

	/**
	 * Drops a field's column, including its data, and the field. The last field takes the table
	 * with it: SQLite tables need at least one column. Throws on database errors.
	 */
	private async removeColumn(
		databaseId: string,
		collection: { id: string; name: string },
		field: Field
	) {
		const collectionFields = await this.db
			.select()
			.from(fields)
			.where(eq(fields.collectionId, collection.id))
			.orderBy(asc(fields.position), asc(fields.createdAt));
		const others = collectionFields.filter((other) => other.id !== field.id);

		if (!others.length) {
			await queryDatabase(databaseId, `DROP TABLE IF EXISTS "${collection.name}"`);
		} else if (field.type === 'id') {
			// SQLite can't drop a primary key column.
			await this.rebuildTable(
				databaseId,
				collection.name,
				others.map((other) => ({
					definition: columnSql(fieldInput(other)),
					name: other.name,
					source: `"${other.name}"`
				})),
				field.name
			);
		} else {
			await this.dropColumn(databaseId, collection, field);
			return;
		}

		await this.db.delete(fields).where(eq(fields.id, field.id));
	}

	/**
	 * Adds an `id` field's column to a table that already exists. SQLite can't add a primary key
	 * column, so the table is rebuilt with it, and existing records get a generated id: their
	 * `rowid` for `autoincrement`. Throws on database errors.
	 */
	private async addPrimaryKey(
		databaseId: string,
		collection: { id: string; name: string },
		input: CreateFieldInput
	) {
		const generator = idGenerator(input.options);
		const collectionFields = await this.db
			.select()
			.from(fields)
			.where(eq(fields.collectionId, collection.id))
			.orderBy(asc(fields.position), asc(fields.createdAt));

		await this.rebuildTable(databaseId, collection.name, [
			{
				// Left empty while copying, then filled below.
				definition: columnSql(input, { nullableKey: true }),
				name: input.name,
				source: generator === 'autoincrement' ? 'rowid' : 'NULL'
			},
			...collectionFields.map((field) => ({
				definition: columnSql(fieldInput(field)),
				name: field.name,
				source: `"${field.name}"`
			}))
		]);

		if (generator === 'autoincrement') {
			return;
		}

		for (;;) {
			const rows = await queryDatabase(
				databaseId,
				`SELECT rowid FROM "${collection.name}" WHERE "${input.name}" IS NULL LIMIT ?`,
				[ID_FILL_SIZE]
			);

			if (!rows.length) {
				return;
			}

			const ids = rows.map(([rowid]) => [Number(rowid), generateId(generator)] as const);

			await queryDatabase(
				databaseId,
				`UPDATE "${collection.name}" SET "${input.name}" = CASE rowid ${ids.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE rowid IN (${ids.map(() => '?').join(', ')})`,
				[...ids.flat(), ...ids.map(([rowid]) => rowid)]
			);
		}
	}

	/**
	 * Recreates a table with the given columns, copied from the `source` expressions. Every record
	 * keeps its `rowid`, and indexes are recreated, except those on `droppedColumn`. Throws on
	 * database errors.
	 */
	private async rebuildTable(
		databaseId: string,
		tableName: string,
		columns: { definition: string; name: string; source: string }[],
		droppedColumn = ''
	) {
		const table = `"${tableName}"`;
		// Collection names can't start with `_`, so this never clashes with a collection.
		const temporary = `"_rebuild_${tableName}"`;
		const indexes = await queryDatabase(
			databaseId,
			`SELECT "sql" FROM sqlite_master WHERE "type" = 'index' AND "tbl_name" = ? AND "sql" IS NOT NULL AND "name" NOT IN (SELECT il.name FROM pragma_index_list(?) AS il JOIN pragma_index_info(il.name) AS ii WHERE ii.name = ?)`,
			[tableName, tableName, droppedColumn]
		);
		// Columns without a field would be lost; that never happens on purpose.
		const kept = new Set([...columns.map((column) => column.name), droppedColumn]);
		const unknown = (
			await queryDatabase(databaseId, `SELECT "name" FROM pragma_table_info(?)`, [tableName])
		)
			.map(([name]) => String(name))
			.filter((name) => !kept.has(name));

		if (unknown.length) {
			throw new Error(`"${tableName}" has columns without a field: ${unknown.join(', ')}`);
		}

		const names = ['rowid', ...columns.map((column) => `"${column.name}"`)].join(', ');
		const sources = ['rowid', ...columns.map((column) => column.source)].join(', ');

		await queryDatabase(databaseId, `DROP TABLE IF EXISTS ${temporary}`);
		await queryDatabase(
			databaseId,
			`CREATE TABLE ${temporary} (${columns.map((column) => column.definition).join(', ')})`
		);

		try {
			await queryDatabase(
				databaseId,
				`INSERT INTO ${temporary} (${names}) SELECT ${sources} FROM ${table}`
			);
		} catch (error) {
			await queryDatabase(databaseId, `DROP TABLE IF EXISTS ${temporary}`);
			throw error;
		}

		await queryDatabase(databaseId, `DROP TABLE ${table}`);
		await queryDatabase(databaseId, `ALTER TABLE ${temporary} RENAME TO ${table}`);

		for (const [statement] of indexes) {
			await queryDatabase(databaseId, String(statement));
		}
	}

	/**
	 * Fails when relation fields point to this collection: they store the `id` of its records, so
	 * the `id` field must stay. Fields in `ignore` (removed in the same save) don't count.
	 */
	private requireIdUnused(
		collectionId: string,
		ignore: string[] = []
	): ResultAsync<void, ServiceError<7000, 'LIST_FIELDS_FAILED'> | IdInUseError> {
		return fromPromise(
			this.db
				.select({ id: fields.id, name: fields.name, collection: collections.name })
				.from(fields)
				.innerJoin(collections, eq(collections.id, fields.collectionId))
				.where(
					and(
						inArray(fields.type, ['relation', 'file']),
						sql`json_extract(${fields.options}, '$.collectionId') = ${collectionId}`
					)
				),
			(error) => this.error(7000, 'LIST_FIELDS_FAILED', error)
		).andThen((references) => {
			const relations = references
				.filter((reference) => !ignore.includes(reference.id))
				.map((reference) => `${reference.collection}.${reference.name}`);

			return relations.length
				? errAsync({
						code: 7020 as const,
						message: 'ID_FIELD_IN_USE' as const,
						data: { relations }
					})
				: okAsync(undefined);
		});
	}

	/** Drops the column, including its data, and the field. Throws on database errors. */
	private async dropColumn(
		databaseId: string,
		collection: { name: string },
		field: Pick<Field, 'id' | 'name'>
	) {
		// SQLite can't drop a column that is part of an index, so drop every index that uses it: its
		// own unique index and custom indexes.
		const indexes = await queryDatabase(
			databaseId,
			`SELECT DISTINCT il.name FROM pragma_index_list(?) AS il JOIN pragma_index_info(il.name) AS ii WHERE ii.name = ? AND il.origin != 'pk'`,
			[collection.name, field.name]
		);

		for (const [name] of indexes) {
			await queryDatabase(databaseId, `DROP INDEX IF EXISTS "${String(name)}"`);
		}

		await queryDatabase(databaseId, `ALTER TABLE "${collection.name}" DROP COLUMN "${field.name}"`);
		await this.db.delete(fields).where(eq(fields.id, field.id));
	}

	/** Fails when computed fields are calculated from this field; they must be removed first. */
	private requireUnused(
		collectionId: string,
		name: string
	): ResultAsync<
		void,
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| (ServiceError<7012, 'FIELD_IN_USE'> & { data: { computed: string[] } })
	> {
		return this.list(collectionId).andThen((collectionFields) => {
			const computed = collectionFields
				.filter((field) => field.type === 'computed' && field.options.source === name)
				.map((field) => field.name);

			return computed.length
				? errAsync({ code: 7012 as const, message: 'FIELD_IN_USE' as const, data: { computed } })
				: okAsync(undefined);
		});
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
