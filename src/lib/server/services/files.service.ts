import type { ErrorOf, ServiceError } from './base.service';
import type { Collection, CollectionsService } from './collections.service';
import type { DatabaseService } from './database.service';
import type { CreateFieldInput } from './fields.service';
import type { StorageService } from './storage.service';
import type { ThumbnailSettings } from '#lib/files/thumbnails.js';
import type { ResultAsync } from 'neverthrow';

import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { FILES_COLLECTION, MAX_FILE_SIZE } from '#lib/files/files.js';
import { parseThumbnailSize } from '#lib/files/thumbnails.js';

import { batchDatabase, queryDatabase, queryObjects } from '../db/query';
import { generateRecordId } from '../crypto';
import { canProcess, editImage, thumbnail, type EncodedImage, type ImageEdits } from '../images';
import { Service } from './base.service';
import { inBackground } from './realtime.service';

/** Fields every file has; they are managed by this service and can't be renamed or deleted. */
const FILE_FIELDS: CreateFieldInput[] = [
	{ name: 'name', type: 'text', required: false, unique: false, options: {} },
	{ name: 'mime_type', type: 'text', required: false, unique: false, options: {} },
	{ name: 'size', type: 'integer', required: false, unique: false, options: {} },
	{ name: 'key', type: 'text', required: false, unique: true, options: {} },
	/** JSON array of the thumbnail sizes stored for this file, e.g. `["100x100"]`. */
	{ name: 'thumbnails', type: 'json', required: false, unique: false, options: {} }
];

/** How long importing a remote image (e.g. an OAuth avatar) may take. */
const IMPORT_TIMEOUT = 5000;

// Once ensured, the files collection stays; cache it per isolate.
let filesCollection: Collection | null = null;

/** Forgets the cached files collection, after the system database was replaced by a restore. */
export function forgetFilesCollection() {
	filesCollection = null;
}

export type StoredFile = {
	id: string;
	name: string;
	mimeType: string;
	size: number;
	key: string;
	/** Thumbnail sizes stored for this file. */
	thumbnails: string[];
};

/** The content to send for a file or one of its thumbnails. */
export type FileContent = {
	file: StoredFile;
	mimeType: string;
	size: number;
	body: ReadableStream | Uint8Array;
};

type UploadError =
	| EnsureFilesError
	| ErrorOf<ReturnType<StorageService['put']>>
	| ServiceError<13001, 'FILE_TOO_LARGE'>
	| ServiceError<13002, 'FILE_EMPTY'>
	| ServiceError<13005, 'SAVE_FILE_FAILED'>;

type EnsureFilesError =
	| ErrorOf<ReturnType<CollectionsService['ensureSystem']>>
	| ErrorOf<ReturnType<DatabaseService['requireApp']>>;

/** Object key in storage: the record id plus a cleaned-up file name, so downloads keep their name. */
function objectKey(id: string, name: string) {
	const cleaned = name
		.normalize('NFKD')
		.replace(/[^\w.-]+/g, '-')
		.replace(/-+/g, '-')
		.slice(-100);

	return `${id}/${cleaned || 'file'}`;
}

const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/** The name of an edited image: unchanged, unless it was converted to another format. */
function editedName(name: string, from: string, to: string) {
	if (from.toLowerCase() === to) {
		return name;
	}

	const baseName = name.replace(/\.[^.]+$/, '') || 'image';

	return `${baseName}.${EXTENSIONS[to] ?? to.split('/')[1] ?? 'png'}`;
}

/** Thumbnails live next to the original, under its (unique) key. */
function thumbnailKey(fileKey: string, spec: string) {
	return `thumbs/${fileKey}/${spec}`;
}

/** Storage keys of a file and all its thumbnails, e.g. to delete them. */
export function storageKeys(file: Pick<StoredFile, 'key' | 'thumbnails'>) {
	return [file.key, ...file.thumbnails.map((spec) => thumbnailKey(file.key, spec))];
}

export function parseThumbnailList(value: unknown): string[] {
	try {
		const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

function toStoredFile(row: Record<string, unknown>): StoredFile {
	return {
		id: String(row.id),
		name: String(row.name ?? 'file'),
		mimeType: String(row.mime_type ?? 'application/octet-stream'),
		size: Number(row.size ?? 0),
		key: String(row.key),
		thumbnails: parseThumbnailList(row.thumbnails)
	};
}

export class FilesService extends Service {
	/** The built-in `files` collection with its system fields. */
	ensureFilesCollection(): ResultAsync<Collection, EnsureFilesError> {
		if (filesCollection) {
			return okAsync(filesCollection);
		}

		return this.services
			.collections()
			.ensureSystem(FILES_COLLECTION, FILE_FIELDS)
			.map((collection) => {
				filesCollection = collection;
				return collection;
			});
	}

	/** Thumbnail settings of the `files` collection (read fresh: they can change at any time). */
	thumbnailSettings(): ResultAsync<
		ThumbnailSettings,
		EnsureFilesError | ErrorOf<ReturnType<CollectionsService['getSettings']>>
	> {
		return this.ensureFilesCollection()
			.andThen(() => this.services.collections().getSettings(FILES_COLLECTION))
			.map((settings) => settings.thumbnails ?? { enabled: false, sizes: [] });
	}

	/**
	 * Stores an upload in object storage and adds it to the `files` collection. When thumbnails are on, they
	 * are generated right away (best effort; missing ones are made on request).
	 */
	create(file: File, name?: string): ResultAsync<StoredFile, UploadError> {
		return this.check(file).andThen(() => {
			const id = generateRecordId();
			const stored: StoredFile = {
				id,
				name: name?.trim() || file.name || 'file',
				mimeType: file.type || 'application/octet-stream',
				size: file.size,
				key: objectKey(id, file.name),
				thumbnails: []
			};

			return this.ensureFilesCollection()
				.andThen(() => this.read(file))
				.andThen((bytes) =>
					this.services
						.storage()
						.put(stored.key, bytes.buffer as ArrayBuffer, stored.mimeType)
						.andThen(() => this.services.database().requireApp())
						.andThen((appDatabase) =>
							fromPromise(
								(async () => {
									const now = Date.now();

									try {
										await queryDatabase(
											appDatabase.id,
											`INSERT INTO "files" ("id", "created_at", "updated_at", "name", "mime_type", "size", "key", "thumbnails") VALUES (?, ?, ?, ?, ?, ?, ?, '[]')`,
											[stored.id, now, now, stored.name, stored.mimeType, stored.size, stored.key]
										);
									} catch (error) {
										// Don't leave an orphaned object behind.
										await this.services.storage().delete([stored.key]);
										throw error;
									}
								})(),
								(error) => this.error(13005, 'SAVE_FILE_FAILED', error)
							)
						)
						.andThen(() =>
							// Computed fields of `files` (e.g. a slug of the name); best effort.
							this.services
								.records()
								.refreshComputed(FILES_COLLECTION, [stored.id])
								.orElse(() => okAsync(undefined))
								.map(() => this.changed('create', stored.id))
						)
						.andThen(() => this.generateThumbnails(stored, bytes))
				);
		});
	}

	/** Replaces the stored file of an existing record; the old object and thumbnails are deleted. */
	replace(
		id: string,
		file: File
	): ResultAsync<
		StoredFile,
		UploadError | ServiceError<13003, 'FILE_NOT_FOUND'> | ServiceError<13006, 'GET_FILE_FAILED'>
	> {
		return this.check(file).andThen(() =>
			this.find(id).andThen((current) => {
				if (!current) {
					return errAsync(this.error(13003, 'FILE_NOT_FOUND'));
				}

				const stored: StoredFile = {
					...current,
					mimeType: file.type || 'application/octet-stream',
					size: file.size,
					key: objectKey(`${id}-${Date.now()}`, file.name),
					thumbnails: []
				};

				return this.read(file).andThen((bytes) =>
					this.services
						.storage()
						.put(stored.key, bytes.buffer as ArrayBuffer, stored.mimeType)
						.andThen(() => this.services.database().requireApp())
						.andThen((appDatabase) =>
							fromPromise(
								queryDatabase(
									appDatabase.id,
									`UPDATE "files" SET "mime_type" = ?, "size" = ?, "key" = ?, "thumbnails" = '[]', "updated_at" = ? WHERE "id" = ?`,
									[stored.mimeType, stored.size, stored.key, Date.now(), id]
								),
								(error) => this.error(13005, 'SAVE_FILE_FAILED', error)
							).map(() => this.changed('update', id))
						)
						.andThen(() =>
							// The new file is saved; failing to clean up the old one isn't fatal.
							this.services
								.storage()
								.delete(storageKeys(current))
								.orElse(() => okAsync(undefined))
						)
						.andThen(() => this.generateThumbnails(stored, bytes))
				);
			})
		);
	}

	/**
	 * Edits an image (crop, rotate, resize, ...) with Photon and replaces the stored file with the
	 * result. Its thumbnails are regenerated.
	 */
	edit(
		id: string,
		edits: ImageEdits
	): ResultAsync<
		StoredFile,
		| UploadError
		| ErrorOf<ReturnType<StorageService['get']>>
		| ServiceError<13003, 'FILE_NOT_FOUND'>
		| ServiceError<13006, 'GET_FILE_FAILED'>
		| ServiceError<13007, 'NOT_AN_IMAGE'>
		| ServiceError<13008, 'EDIT_FAILED'>
	> {
		return this.find(id).andThen((current) => {
			if (!current) {
				return errAsync(this.error(13003, 'FILE_NOT_FOUND'));
			}

			if (!canProcess(current.mimeType)) {
				return errAsync(this.error(13007, 'NOT_AN_IMAGE'));
			}

			return this.services
				.storage()
				.get(current.key)
				.andThen((original) =>
					original ? okAsync(original) : errAsync(this.error(13003, 'FILE_NOT_FOUND'))
				)
				.andThen((original) =>
					fromPromise(
						(async () => {
							const bytes = new Uint8Array(await original.arrayBuffer());
							const result = editImage(bytes, current.mimeType, edits);

							return new File(
								[result.bytes as Uint8Array<ArrayBuffer>],
								editedName(current.name, current.mimeType, result.mimeType),
								{
									type: result.mimeType
								}
							);
						})(),
						(error) => this.error(13008, 'EDIT_FAILED', error)
					)
				)
				.andThen((file) =>
					this.replace(id, file).andThen((stored) =>
						// Converted to another format: the name gets the matching extension.
						file.name === current.name ? okAsync(stored) : this.rename(stored, file.name)
					)
				);
		});
	}

	private rename(
		file: StoredFile,
		name: string
	): ResultAsync<
		StoredFile,
		ErrorOf<ReturnType<DatabaseService['requireApp']>> | ServiceError<13005, 'SAVE_FILE_FAILED'>
	> {
		return this.services
			.database()
			.requireApp()
			.andThen((appDatabase) =>
				fromPromise(
					queryDatabase(appDatabase.id, `UPDATE "files" SET "name" = ? WHERE "id" = ?`, [
						name,
						file.id
					]),
					(error) => this.error(13005, 'SAVE_FILE_FAILED', error)
				)
			)
			.map(() => {
				this.changed('update', file.id);
				return { ...file, name };
			});
	}

	/** Sends the realtime event of a file this service wrote directly. */
	private changed(action: 'create' | 'update', id: string) {
		inBackground(this.services.records().announceStored(FILES_COLLECTION, action, [id]));
	}

	/**
	 * Downloads an image (e.g. an OAuth avatar) and stores it as a file.
	 * Returns `null` when the URL doesn't point to a usable image.
	 */
	importImage(
		url: string,
		name: string
	): ResultAsync<StoredFile | null, UploadError | ServiceError<13004, 'IMPORT_FAILED'>> {
		return fromPromise(
			(async () => {
				const response = await fetch(url, { signal: AbortSignal.timeout(IMPORT_TIMEOUT) });
				const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';

				if (!response.ok || !type.startsWith('image/')) {
					return null;
				}

				const body = await response.arrayBuffer();
				const extension = type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'img';

				return new File([body], `${name}.${extension}`, { type });
			})(),
			(error) => this.error(13004, 'IMPORT_FAILED', error)
		).andThen((file) => (file && file.size <= MAX_FILE_SIZE ? this.create(file) : okAsync(null)));
	}

	/** A file record, or `null` when it doesn't exist. */
	find(
		id: string
	): ResultAsync<StoredFile | null, EnsureFilesError | ServiceError<13006, 'GET_FILE_FAILED'>> {
		return this.ensureFilesCollection()
			.andThen(() => this.services.database().requireApp())
			.andThen((appDatabase) =>
				fromPromise(
					queryObjects(
						appDatabase.id,
						`SELECT "id", "name", "mime_type", "size", "key", "thumbnails" FROM "files" WHERE "id" = ?`,
						[id]
					),
					(error) => this.error(13006, 'GET_FILE_FAILED', error)
				)
			)
			.map(([row]) => (row?.key ? toStoredFile(row) : null));
	}

	/**
	 * A file's content, or one of its thumbnails (`thumb`, e.g. `100x100`). A thumbnail is only
	 * served for a configured size; when it doesn't exist yet it is generated and stored. In every
	 * other case (thumbnails off, unknown size, not an image) the original is served.
	 * Returns `null` when the file doesn't exist.
	 */
	open(
		id: string,
		thumb?: string | null
	): ResultAsync<
		FileContent | null,
		| EnsureFilesError
		| ServiceError<13006, 'GET_FILE_FAILED'>
		| ErrorOf<ReturnType<StorageService['get']>>
		| ErrorOf<ReturnType<FilesService['thumbnailSettings']>>
		| ErrorOf<ReturnType<StorageService['put']>>
		| ServiceError<13009, 'THUMBNAIL_FAILED'>
	> {
		return this.find(id).andThen((file) => {
			if (!file) {
				return okAsync(null);
			}

			const original = () =>
				this.services
					.storage()
					.get(file.key)
					.map((body) =>
						body?.body ? { file, mimeType: file.mimeType, size: file.size, body: body.body } : null
					);
			const size = thumb ? parseThumbnailSize(thumb) : null;

			if (!size || !canProcess(file.mimeType)) {
				return original();
			}

			return this.thumbnailSettings().andThen((settings) => {
				if (!settings.enabled || !settings.sizes.includes(size.spec)) {
					return original();
				}

				const key = thumbnailKey(file.key, size.spec);

				return this.services
					.storage()
					.get(key)
					.andThen((stored) => {
						if (stored?.body) {
							return okAsync({
								file,
								mimeType: stored.headers.get('content-type') ?? file.mimeType,
								size: Number(stored.headers.get('content-length') ?? 0),
								body: stored.body as ReadableStream
							} satisfies FileContent);
						}

						// Not generated yet: make it now, store it, and serve it.
						return this.services
							.storage()
							.get(file.key)
							.andThen((source) =>
								source ? this.storeThumbnail(file, size.spec, source) : okAsync(null)
							)
							.andThen((generated) =>
								generated
									? okAsync({
											file,
											mimeType: generated.mimeType,
											size: generated.bytes.length,
											body: generated.bytes
										} satisfies FileContent)
									: original()
							);
					});
			});
		});
	}

	/** Generates the configured thumbnails of an image. Best effort: never fails the upload. */
	private generateThumbnails(file: StoredFile, bytes: Uint8Array): ResultAsync<StoredFile, never> {
		if (!canProcess(file.mimeType)) {
			return okAsync(file);
		}

		return this.thumbnailSettings()
			.andThen((settings) => {
				if (!settings.enabled || !settings.sizes.length) {
					return okAsync(file);
				}

				let chain: ResultAsync<void, never> = okAsync(undefined);

				for (const spec of settings.sizes) {
					chain = chain.andThen((): ResultAsync<void, never> =>
						this.storeThumbnail(file, spec, new Response(bytes as Uint8Array<ArrayBuffer>))
							.map(() => undefined)
							.orElse(() => okAsync(undefined))
					);
				}

				return chain.map(() => file);
			})
			.orElse(() => okAsync(file));
	}

	/** Makes one thumbnail from the original, stores it and records its size on the file. */
	private storeThumbnail(
		file: StoredFile,
		spec: string,
		source: Response
	): ResultAsync<
		EncodedImage | null,
		| ErrorOf<ReturnType<StorageService['put']>>
		| ErrorOf<ReturnType<DatabaseService['requireApp']>>
		| ServiceError<13009, 'THUMBNAIL_FAILED'>
	> {
		const size = parseThumbnailSize(spec);

		if (!size) {
			return okAsync(null);
		}

		return fromPromise(
			(async () => thumbnail(new Uint8Array(await source.arrayBuffer()), file.mimeType, size))(),
			(error) => this.error(13009, 'THUMBNAIL_FAILED', error)
		).andThen((generated) =>
			this.services
				.storage()
				.put(
					thumbnailKey(file.key, size.spec),
					generated.bytes.buffer as ArrayBuffer,
					generated.mimeType
				)
				.andThen(() => this.services.database().requireApp())
				.andThen((appDatabase) =>
					fromPromise(
						// Appends the size unless it is already listed (two requests can race).
						queryDatabase(
							appDatabase.id,
							`UPDATE "files" SET "thumbnails" = json_insert(coalesce("thumbnails", '[]'), '$[#]', ?) WHERE "id" = ? AND NOT EXISTS (SELECT 1 FROM json_each(coalesce("thumbnails", '[]')) WHERE value = ?)`,
							[size.spec, file.id, size.spec]
						),
						(error) => this.error(13009, 'THUMBNAIL_FAILED', error)
					)
				)
				.map(() => {
					file.thumbnails = [...new Set([...file.thumbnails, size.spec])];
					return generated;
				})
		);
	}

	/**
	 * Walks all files in id order, e.g. to copy them to other storage: up to `limit` files after
	 * `after`, plus how many files there are and how many come at or before `after`.
	 */
	scan(
		after: string | null,
		limit: number
	): ResultAsync<
		{ files: StoredFile[]; total: number; done: number },
		EnsureFilesError | ServiceError<13010, 'SCAN_FILES_FAILED'>
	> {
		const cursor = after ?? '';

		return this.ensureFilesCollection()
			.andThen(() => this.services.database().requireApp())
			.andThen((appDatabase) =>
				fromPromise(
					batchDatabase(appDatabase.id, [
						{ sql: `SELECT COUNT(*) FROM "files"` },
						{ sql: `SELECT COUNT(*) FROM "files" WHERE "id" <= ?`, params: [cursor] },
						{
							sql: `SELECT "id", "name", "mime_type", "size", "key", "thumbnails" FROM "files" WHERE "id" > ? AND "key" IS NOT NULL ORDER BY "id" LIMIT ?`,
							params: [cursor, limit]
						}
					]),
					(error) => this.error(13010, 'SCAN_FILES_FAILED', error)
				)
			)
			.map(([[total], [done], rows]) => ({
				total: Number(total?.[0] ?? 0),
				done: Number(done?.[0] ?? 0),
				files: rows.map(([id, name, mimeType, size, key, thumbnails]) =>
					toStoredFile({ id, name, mime_type: mimeType, size, key, thumbnails })
				)
			}));
	}

	private check(
		file: File
	): ResultAsync<void, ServiceError<13001, 'FILE_TOO_LARGE'> | ServiceError<13002, 'FILE_EMPTY'>> {
		if (!file.size) {
			return errAsync(this.error(13002, 'FILE_EMPTY'));
		}

		if (file.size > MAX_FILE_SIZE) {
			return errAsync(this.error(13001, 'FILE_TOO_LARGE'));
		}

		return okAsync(undefined);
	}

	private read(file: File) {
		return fromPromise(
			file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
			(error) => this.error(13005, 'SAVE_FILE_FAILED', error)
		);
	}
}
