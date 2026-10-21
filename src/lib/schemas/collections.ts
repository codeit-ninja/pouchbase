import { z } from 'zod';

/**
 * Collection names are used as table names in the app database, so they are restricted to a safe
 * identifier: lowercase letters, numbers and underscores, starting with a letter.
 */
export const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export const collectionName = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, 'Enter a name')
	.max(63, 'Name must be at most 63 characters')
	.regex(
		COLLECTION_NAME_PATTERN,
		'Start with a letter and use only lowercase letters, numbers and underscores'
	)
	.refine((name) => !name.startsWith('sqlite_'), 'Names starting with "sqlite_" are reserved');

export const createCollectionSchema = z.object({
	name: collectionName
});

export const renameCollectionSchema = z.object({
	/** Current name, sent as a hidden field. */
	name: z.string(),
	newName: collectionName
});

export const deleteCollectionSchema = z.object({
	/** Sent as a hidden field. */
	name: z.string()
});
