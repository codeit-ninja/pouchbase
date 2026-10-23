import type { ErrorOf, ServiceError } from './base.service';
import type { CollectionSettings } from '#lib/files/thumbnails.js';
import type { CreateFieldInput, Field, FieldsService } from './fields.service';
import type { ResultAsync } from 'neverthrow';

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { BUILT_IN_DEFAULT_FIELDS, isAutoType } from '#lib/fields/field-types.js';
import { COLLECTION_NAME_PATTERN } from '#lib/schemas/collections.js';

import { queryDatabase, tableExists } from '../db/query';
import { collections, fields } from '../db';
import { Service } from './base.service';

export type Collection = typeof collections.$inferSelect;

type EnsureSystemError =
	| ServiceError<6001, 'GET_COLLECTION_FAILED'>
	| ServiceError<6012, 'ENSURE_SYSTEM_FAILED'>
	| ErrorOf<ReturnType<CollectionsService['createBuiltIn']>>
	| ErrorOf<ReturnType<FieldsService['list']>>
	| ErrorOf<ReturnType<FieldsService['create']>>;

/** Collection names end up in SQL as table names, so they are validated here too, not only in forms. */
function isValidName(name: string) {
	return COLLECTION_NAME_PATTERN.test(name) && !name.startsWith('sqlite_');
}

/** The table of a built-in collection starts with the columns of `BUILT_IN_DEFAULT_FIELDS`. */
function createTableSql(name: string) {
	return `CREATE TABLE "${name}" (
	"id" TEXT PRIMARY KEY NOT NULL,
	"created_at" INTEGER NOT NULL,
	"updated_at" INTEGER NOT NULL
)`;
}

export class CollectionsService extends Service {
	list(): ResultAsync<Collection[], ServiceError<6000, 'LIST_COLLECTIONS_FAILED'>> {
		return fromPromise(this.db.select().from(collections).orderBy(asc(collections.name)), (error) =>
			this.error(6000, 'LIST_COLLECTIONS_FAILED', error)
		);
	}

	getByName(
		name: string
	): ResultAsync<Collection | null, ServiceError<6001, 'GET_COLLECTION_FAILED'>> {
		return fromPromise(
			this.db.select().from(collections).where(eq(collections.name, name)),
			(error) => this.error(6001, 'GET_COLLECTION_FAILED', error)
		).map(([collection]) => collection ?? null);
	}

	getById(
		id: string
	): ResultAsync<Collection | null, ServiceError<6010, 'GET_COLLECTION_BY_ID_FAILED'>> {
		return fromPromise(this.db.select().from(collections).where(eq(collections.id, id)), (error) =>
			this.error(6010, 'GET_COLLECTION_BY_ID_FAILED', error)
		).map(([collection]) => collection ?? null);
	}

	/**
	 * Registers a collection without fields. SQLite tables need at least one column, so its table is
	 * created in the app database together with the first field (see `FieldsService.create`).
	 */
	create(
		name: string
	): ResultAsync<
		Collection,
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6002, 'INVALID_COLLECTION_NAME'>
		| ServiceError<6003, 'COLLECTION_ALREADY_EXISTS'>
		| ServiceError<6005, 'CREATE_COLLECTION_FAILED'>
	> {
		if (!isValidName(name)) {
			return errAsync(this.error(6002, 'INVALID_COLLECTION_NAME'));
		}

		return this.ensureNameAvailable(name).andThen(() =>
			fromPromise(this.db.insert(collections).values({ name }).returning(), (error) =>
				this.error(6005, 'CREATE_COLLECTION_FAILED', error)
			).map(([collection]) => collection)
		);
	}

	/** Creates a built-in collection with its table and `BUILT_IN_DEFAULT_FIELDS`. */
	private createBuiltIn(
		name: string
	): ResultAsync<
		Collection,
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6002, 'INVALID_COLLECTION_NAME'>
		| ServiceError<6003, 'COLLECTION_ALREADY_EXISTS'>
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<6005, 'CREATE_COLLECTION_FAILED'>
	> {
		if (!isValidName(name)) {
			return errAsync(this.error(6002, 'INVALID_COLLECTION_NAME'));
		}

		return this.ensureNameAvailable(name)
			.andThen(() => this.services.database().requireApp())
			.andThen((appDatabase) =>
				fromPromise(
					(async () => {
						await queryDatabase(appDatabase.id, createTableSql(name));

						const [collection] = await this.db.insert(collections).values({ name }).returning();

						await this.db.insert(fields).values(
							BUILT_IN_DEFAULT_FIELDS.map((field, position) => ({
								collectionId: collection.id,
								name: field.name,
								type: field.type,
								options: field.options,
								position
							}))
						);

						return collection;
					})(),
					(error) => this.error(6005, 'CREATE_COLLECTION_FAILED', error)
				)
			);
	}

	/** Renames the table in the app database and the collection in the system database. */
	rename(
		name: string,
		newName: string
	): ResultAsync<
		Collection,
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6002, 'INVALID_COLLECTION_NAME'>
		| ServiceError<6003, 'COLLECTION_ALREADY_EXISTS'>
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<6007, 'RENAME_COLLECTION_FAILED'>
		| ServiceError<6011, 'SYSTEM_COLLECTION'>
	> {
		if (!isValidName(newName)) {
			return errAsync(this.error(6002, 'INVALID_COLLECTION_NAME'));
		}

		return this.requireByName(name).andThen((collection) => {
			if (collection.system) {
				return errAsync(this.error(6011, 'SYSTEM_COLLECTION'));
			}

			if (newName === collection.name) {
				return okAsync(collection);
			}

			return this.ensureNameAvailable(newName)
				.andThen(() => this.services.database().requireApp())
				.andThen((appDatabase) =>
					fromPromise(
						(async () => {
							// A collection without fields has no table yet.
							if (await tableExists(appDatabase.id, collection.name)) {
								await queryDatabase(
									appDatabase.id,
									`ALTER TABLE "${collection.name}" RENAME TO "${newName}"`
								);
							}

							const [renamed] = await this.db
								.update(collections)
								.set({ name: newName })
								.where(eq(collections.id, collection.id))
								.returning();

							return renamed;
						})(),
						(error) => this.error(6007, 'RENAME_COLLECTION_FAILED', error)
					)
				);
		});
	}

	/**
	 * Drops the table, including all its records, and removes the collection.
	 * Refused while relation fields of other collections point to it.
	 */
	delete(
		name: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<6008, 'DELETE_COLLECTION_FAILED'>
		| ServiceError<6009, 'COLLECTION_IN_USE'>
		| ServiceError<6011, 'SYSTEM_COLLECTION'>
	> {
		return this.requireByName(name)
			.andThen((collection) =>
				collection.system ? errAsync(this.error(6011, 'SYSTEM_COLLECTION')) : okAsync(collection)
			)
			.andThen((collection) =>
				fromPromise(
					this.db
						.select({ id: fields.id })
						.from(fields)
						.where(
							and(
								eq(fields.type, 'relation'),
								ne(fields.collectionId, collection.id),
								sql`json_extract(${fields.options}, '$.collectionId') = ${collection.id}`
							)
						)
						.limit(1),
					(error) => this.error(6008, 'DELETE_COLLECTION_FAILED', error)
				).andThen(([reference]) =>
					reference ? errAsync(this.error(6009, 'COLLECTION_IN_USE')) : okAsync(collection)
				)
			)
			.andThen((collection) =>
				this.services
					.database()
					.requireApp()
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								await queryDatabase(appDatabase.id, `DROP TABLE IF EXISTS "${collection.name}"`);
								await this.db.delete(collections).where(eq(collections.id, collection.id));
							})(),
							(error) => this.error(6008, 'DELETE_COLLECTION_FAILED', error)
						)
					)
			);
	}

	/**
	 * Creates a built-in collection with its system fields, or brings an existing one up to date:
	 * marks it (and those fields, plus its default fields) as system and adds missing fields. Used
	 * for `users` and `files`.
	 */
	ensureSystem(
		name: string,
		systemFields: CreateFieldInput[]
	): ResultAsync<Collection, EnsureSystemError> {
		return this.getByName(name)
			.andThen((existing): ResultAsync<Collection, EnsureSystemError> =>
				existing ? okAsync(existing) : this.createBuiltIn(name)
			)
			.andThen((collection) =>
				collection.system
					? okAsync(collection)
					: fromPromise(
							this.db
								.update(collections)
								.set({ system: true })
								.where(eq(collections.id, collection.id)),
							(error) => this.error(6012, 'ENSURE_SYSTEM_FAILED', error)
						).map(() => ({ ...collection, system: true }))
			)
			.andThen((collection) =>
				this.services
					.fields()
					.list(collection.id)
					.andThen((existing) => {
						let chain: ResultAsync<void, EnsureSystemError> = okAsync(undefined);

						// The default fields come with the table; they can't be added afterwards.
						const defaults = BUILT_IN_DEFAULT_FIELDS.map((field) => ({
							...field,
							required: false,
							unique: false
						}));

						for (const field of [...defaults, ...systemFields]) {
							const current = existing.find((candidate) => candidate.name === field.name);

							chain = chain.andThen((): ResultAsync<void, EnsureSystemError> => {
								if (!current && isAutoType(field.type)) {
									return okAsync(undefined);
								}

								if (!current) {
									return this.services
										.fields()
										.create(name, { ...field, system: true })
										.map(() => undefined);
								}

								if (current.system) {
									return okAsync(undefined);
								}

								return fromPromise(
									this.db.update(fields).set({ system: true }).where(eq(fields.id, current.id)),
									(error) => this.error(6012, 'ENSURE_SYSTEM_FAILED', error)
								).map(() => undefined);
							});
						}

						return chain.map(() => collection);
					})
			);
	}

	/** Settings of a collection, e.g. thumbnail sizes of `files`. */
	getSettings(
		name: string
	): ResultAsync<
		CollectionSettings,
		ServiceError<6001, 'GET_COLLECTION_FAILED'> | ServiceError<6006, 'COLLECTION_NOT_FOUND'>
	> {
		return this.requireByName(name).map((collection) => collection.settings ?? {});
	}

	/** Replaces the given sections of a collection's settings; other sections are kept. */
	updateSettings(
		name: string,
		changes: Partial<CollectionSettings>
	): ResultAsync<
		CollectionSettings,
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<6013, 'UPDATE_SETTINGS_FAILED'>
	> {
		return this.requireByName(name).andThen((collection) => {
			const settings: CollectionSettings = { ...(collection.settings ?? {}), ...changes };

			return fromPromise(
				this.db.update(collections).set({ settings }).where(eq(collections.id, collection.id)),
				(error) => this.error(6013, 'UPDATE_SETTINGS_FAILED', error)
			).map(() => settings);
		});
	}

	/** The collection with this name; an error when it doesn't exist. */
	requireByName(
		name: string
	): ResultAsync<
		Collection,
		ServiceError<6001, 'GET_COLLECTION_FAILED'> | ServiceError<6006, 'COLLECTION_NOT_FOUND'>
	> {
		return this.getByName(name).andThen((collection) =>
			collection ? okAsync(collection) : errAsync(this.error(6006, 'COLLECTION_NOT_FOUND'))
		);
	}

	/**
	 * The collection with this name and its fields (in position order), read in one round-trip; an
	 * error when it doesn't exist.
	 */
	requireWithFields(
		name: string
	): ResultAsync<
		{ collection: Collection; fields: Field[] },
		ServiceError<6001, 'GET_COLLECTION_FAILED'> | ServiceError<6006, 'COLLECTION_NOT_FOUND'>
	> {
		return fromPromise(
			this.db.batch([
				this.db.select().from(collections).where(eq(collections.name, name)),
				this.db
					.select()
					.from(fields)
					.where(
						inArray(
							fields.collectionId,
							this.db
								.select({ id: collections.id })
								.from(collections)
								.where(eq(collections.name, name))
						)
					)
					.orderBy(asc(fields.position), asc(fields.createdAt))
			]),
			(error) => this.error(6001, 'GET_COLLECTION_FAILED', error)
		).andThen(([[collection], collectionFields]) =>
			collection
				? okAsync({ collection, fields: collectionFields })
				: errAsync(this.error(6006, 'COLLECTION_NOT_FOUND'))
		);
	}

	private ensureNameAvailable(
		name: string
	): ResultAsync<
		void,
		ServiceError<6001, 'GET_COLLECTION_FAILED'> | ServiceError<6003, 'COLLECTION_ALREADY_EXISTS'>
	> {
		return this.getByName(name).andThen((existing) =>
			existing ? errAsync(this.error(6003, 'COLLECTION_ALREADY_EXISTS')) : okAsync(undefined)
		);
	}
}
