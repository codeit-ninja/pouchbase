import type { ServiceError } from './base.service';
import type { Collection } from './collections.service';
import type { Field } from './fields.service';

import { errAsync, fromPromise, okAsync, ResultAsync } from 'neverthrow';

import { queryDatabase } from '../db/query';
import { Service } from './base.service';
import { uniqueIndexName } from './fields.service';

export type CollectionIndex = {
	name: string;
	columns: string[];
	unique: boolean;
	/** Name of the field that owns this index (a field marked "Unique"); `null` for custom indexes. */
	managedBy: string | null;
};

export type IndexInput = {
	columns: string[];
	unique: boolean;
};

const MAX_COLUMNS = 8;
const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Custom indexes are named `ix_<random>`; index names are unique per database. */
function randomIndexName() {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return `ix_${Array.from(bytes, (byte) => NAME_ALPHABET[byte % NAME_ALPHABET.length]).join('')}`;
}

/** Columns an index can be created on: every field except blobs. */
function indexableColumns(collectionFields: Field[]) {
	return new Set(
		collectionFields.filter((field) => field.type !== 'blob').map((field) => field.name)
	);
}

/** Groups the pragma rows per index and marks the ones owned by a "Unique" field. */
function toIndexes(rows: unknown[][], collectionFields: Field[]) {
	const owners = new Map(collectionFields.map((field) => [uniqueIndexName(field), field.name]));
	const indexes = new Map<string, CollectionIndex>();

	for (const [name, unique, column] of rows) {
		const key = String(name);
		const index = indexes.get(key) ?? {
			name: key,
			columns: [],
			unique: Number(unique) === 1,
			managedBy: owners.get(key) ?? null
		};

		index.columns.push(String(column));
		indexes.set(key, index);
	}

	return [...indexes.values()];
}

export class IndexesService extends Service {
	/** The indexes of a collection's table, read from the app database itself. */
	list(
		collectionName: string
	): ResultAsync<
		CollectionIndex[],
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<9000, 'LIST_INDEXES_FAILED'>
	> {
		// The index list only needs the table name, so it is read while the collection is looked up.
		return ResultAsync.combine([
			this.collectionWithFields(collectionName),
			this.services
				.database()
				.requireApp()
				.andThen((appDatabase) =>
					fromPromise(this.readRows(appDatabase.id, collectionName), (error) =>
						this.error(9000, 'LIST_INDEXES_FAILED', error)
					)
				)
		]).map(([{ fields }, rows]) => toIndexes(rows, fields));
	}

	create(
		collectionName: string,
		input: IndexInput
	): ResultAsync<
		CollectionIndex,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<9001, 'INVALID_INDEX_COLUMNS'>
		| ServiceError<9002, 'DUPLICATE_VALUES'>
		| ServiceError<9003, 'CREATE_INDEX_FAILED'>
	> {
		return this.context(collectionName).andThen(({ collection, fields, databaseId }) =>
			this.createIndex(databaseId, collection, fields, input)
		);
	}

	/**
	 * Changes the columns or uniqueness of a custom index. SQLite can't alter an index, so a new
	 * one is created first and the old one is dropped after; if creating fails, nothing changes.
	 */
	update(
		collectionName: string,
		name: string,
		input: IndexInput
	): ResultAsync<
		CollectionIndex,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<9001, 'INVALID_INDEX_COLUMNS'>
		| ServiceError<9002, 'DUPLICATE_VALUES'>
		| ServiceError<9003, 'CREATE_INDEX_FAILED'>
		| ServiceError<9004, 'INDEX_NOT_FOUND'>
		| ServiceError<9006, 'UPDATE_INDEX_FAILED'>
	> {
		return this.context(collectionName).andThen(({ collection, fields, databaseId }) =>
			this.findCustom(databaseId, collection, fields, name, 9006, 'UPDATE_INDEX_FAILED').andThen(
				(index) =>
					this.createIndex(databaseId, collection, fields, input).andThen((created) =>
						fromPromise(queryDatabase(databaseId, `DROP INDEX "${index.name}"`), (error) =>
							this.error(9006, 'UPDATE_INDEX_FAILED', error)
						)
							// Keep a single index: remove the new one again when the old one stays.
							.orElse((error) =>
								fromPromise(
									queryDatabase(databaseId, `DROP INDEX "${created.name}"`),
									() => error
								).andThen(() => errAsync(error))
							)
							.map(() => created)
					)
			)
		);
	}

	/** Drops a custom index. Indexes owned by a "Unique" field are removed through that field. */
	delete(
		collectionName: string,
		name: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ServiceError<7000, 'LIST_FIELDS_FAILED'>
		| ServiceError<9004, 'INDEX_NOT_FOUND'>
		| ServiceError<9005, 'DELETE_INDEX_FAILED'>
	> {
		return this.context(collectionName).andThen(({ collection, fields, databaseId }) =>
			this.findCustom(databaseId, collection, fields, name, 9005, 'DELETE_INDEX_FAILED').andThen(
				(index) =>
					fromPromise(queryDatabase(databaseId, `DROP INDEX "${index.name}"`), (error) =>
						this.error(9005, 'DELETE_INDEX_FAILED', error)
					).map(() => undefined)
			)
		);
	}

	/** Creates an index on known columns only, since column names end up in SQL. */
	private createIndex(
		databaseId: string,
		collection: Collection,
		fields: Field[],
		input: IndexInput
	): ResultAsync<
		CollectionIndex,
		| ServiceError<9001, 'INVALID_INDEX_COLUMNS'>
		| ServiceError<9002, 'DUPLICATE_VALUES'>
		| ServiceError<9003, 'CREATE_INDEX_FAILED'>
	> {
		const columns = [...new Set(input.columns)];
		const allowed = indexableColumns(fields);

		if (
			!columns.length ||
			columns.length > MAX_COLUMNS ||
			!columns.every((column) => allowed.has(column))
		) {
			return errAsync(this.error(9001, 'INVALID_INDEX_COLUMNS'));
		}

		const name = randomIndexName();

		return fromPromise(
			queryDatabase(
				databaseId,
				`CREATE ${input.unique ? 'UNIQUE ' : ''}INDEX "${name}" ON "${collection.name}" (${columns.map((column) => `"${column}"`).join(', ')})`
			),
			(error) =>
				String(error instanceof Error ? error.message : error).includes('UNIQUE constraint failed')
					? this.error(9002, 'DUPLICATE_VALUES', error)
					: this.error(9003, 'CREATE_INDEX_FAILED', error)
		).map(() => ({ name, columns, unique: input.unique, managedBy: null }));
	}

	/** A custom index by name; indexes owned by a "Unique" field are changed through that field. */
	private findCustom<Code extends number, Message extends string>(
		databaseId: string,
		collection: Collection,
		fields: Field[],
		name: string,
		code: Code,
		message: Message
	): ResultAsync<
		CollectionIndex,
		ServiceError<9004, 'INDEX_NOT_FOUND'> | ServiceError<Code, Message>
	> {
		return fromPromise(this.read(databaseId, collection, fields), (error) =>
			this.error(code, message, error)
		).andThen((indexes) => {
			const found = indexes.find((candidate) => candidate.name === name);

			return found && !found.managedBy
				? okAsync(found)
				: errAsync(this.error(9004, 'INDEX_NOT_FOUND'));
		});
	}

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
		return ResultAsync.combine([
			this.collectionWithFields(collectionName),
			this.services.database().requireApp()
		]).map(([{ collection, fields }, appDatabase]) => ({
			collection,
			fields,
			databaseId: appDatabase.id
		}));
	}

	private collectionWithFields(
		collectionName: string
	): ResultAsync<
		{ collection: Collection; fields: Field[] },
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
					.map((fields) => ({ collection, fields }))
			);
	}

	/** Reads the indexes through SQLite's pragmas. Throws on database errors. */
	private async read(databaseId: string, collection: Collection, fields: Field[]) {
		return toIndexes(await this.readRows(databaseId, collection.name), fields);
	}

	/** One row per indexed column: `[index name, unique, column]`. Throws on database errors. */
	private readRows(databaseId: string, tableName: string) {
		return queryDatabase(
			databaseId,
			`SELECT il.name, il."unique", ii.name FROM pragma_index_list(?) AS il JOIN pragma_index_info(il.name) AS ii WHERE il.origin != 'pk' ORDER BY il.name, ii.seqno`,
			[tableName]
		);
	}
}
