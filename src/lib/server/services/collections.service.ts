import type { ServiceError } from './base.service';
import type { ResultAsync } from 'neverthrow';

import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { COLLECTION_NAME_PATTERN } from '#lib/schemas/collections.js';

import { queryDatabase } from '../cloudflare/d1';
import { collections, fields } from '../db';
import { Service } from './base.service';

export type Collection = typeof collections.$inferSelect;

/** Collection names end up in SQL as table names, so they are validated here too, not only in forms. */
function isValidName(name: string) {
	return COLLECTION_NAME_PATTERN.test(name) && !name.startsWith('sqlite_');
}

/** Every collection table starts with these system columns. */
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

	/** Creates the table in the app database and registers the collection in the system database. */
	create(
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
							await queryDatabase(
								appDatabase.id,
								`ALTER TABLE "${collection.name}" RENAME TO "${newName}"`
							);

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
