import { z } from 'zod';

export const RECORDS_PER_PAGE = 50;

export const listRecordsSchema = z.object({
	collection: z.string(),
	page: z.number().int().min(1).default(1),
	sort: z.string().optional(),
	order: z.enum(['asc', 'desc']).optional()
});

export const getRecordSchema = z.object({
	collection: z.string(),
	id: z.string()
});

export const deleteRecordsSchema = z.object({
	/** Hidden fields. */
	collection: z.string(),
	/** JSON array of record ids. */
	ids: z.string().min(1)
});

/**
 * Shape of the record form. Its fields depend on the collection, so it is validated by the
 * records service instead of a schema.
 */
export type SaveRecordInput = {
	collection: string;
	/** Empty when creating a record. */
	id?: string;
	values?: Record<string, string | number | boolean>;
	/**
	 * Only for the built-in `users` collection: sets the user's password. Empty keeps it.
	 * Leading underscore: never sent back to the browser.
	 */
	_password?: string;
	/** Only for the built-in `files` collection: the uploaded file (required when creating). */
	_file?: File;
	/**
	 * New files for relation fields that point to `files` (e.g. a user's `avatar`), keyed by field
	 * name. Each upload is stored in `files` and replaces the field's selected file.
	 */
	_uploads?: Record<string, File>;
};
