import { z } from 'zod';

import { FIELD_TYPE_IDS } from '#lib/fields/field-types.js';
import { FilterError, MAX_FILTER_LENGTH, parseFilter } from '#lib/filter/filter.js';
import { API_RULE_ACTIONS } from '#lib/filter/rules.js';

import { fieldOptionsSchema, snapshotCollectionSchema } from './environments';

/**
 * Collection names are used as table names in the app database, so they are restricted to a safe
 * identifier: lowercase letters, numbers and underscores, starting with a letter.
 */
export const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

/** Names taken by the collections API itself (`/api/collections/export` and `/import`). */
export const RESERVED_COLLECTION_NAMES = ['export', 'import'];

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
	.refine((name) => !name.startsWith('sqlite_'), 'Names starting with "sqlite_" are reserved')
	.refine((name) => !RESERVED_COLLECTION_NAMES.includes(name), 'This name is reserved');

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

/** Version of the export file format. */
export const COLLECTION_EXPORT_FORMAT = 1;

/**
 * A file with collections as `GET /api/collections/export` and the Collections menu make it: their
 * fields, indexes, API rules and settings, without records. Relation fields point at collections
 * by id; `related` names the collections they point at that aren't in the file, so an import on
 * another instance finds them by name.
 */
export const collectionExportSchema = z.object({
	format: z.literal(COLLECTION_EXPORT_FORMAT),
	exportedAt: z.string(),
	collections: z.array(snapshotCollectionSchema),
	related: z.array(z.object({ id: z.string(), name: z.string() })).default([])
});

export type CollectionExport = z.infer<typeof collectionExportSchema>;

const ruleSchema = z
	.string()
	.max(MAX_FILTER_LENGTH)
	.nullable()
	.superRefine((rule, ctx) => {
		if (!rule?.trim()) {
			return;
		}

		try {
			parseFilter(rule);
		} catch (error) {
			ctx.addIssue({
				code: 'custom',
				message: error instanceof FilterError ? error.message : 'Invalid rule'
			});
		}
	});

/**
 * A field as the collections API takes it. A field with an `id`, or else with the name of an
 * existing field, changes that field; other fields are added.
 */
export const apiFieldSchema = z.object({
	id: z.string().min(1).max(64).optional(),
	name: z.string().min(1).max(63),
	type: z.enum(FIELD_TYPE_IDS),
	required: z.boolean().default(false),
	unique: z.boolean().default(false),
	defaultValue: z.string().nullable().default(null),
	options: fieldOptionsSchema.default({})
});

export const apiIndexSchema = z.object({
	columns: z.array(z.string().min(1)).min(1),
	unique: z.boolean().default(false)
});

const apiCollectionFields = {
	/** The fields in display order; on update, fields that are left out are deleted. */
	fields: z.array(apiFieldSchema).max(200),
	/** Custom indexes; on update, indexes that are left out are dropped. */
	indexes: z.array(apiIndexSchema).max(100),
	/** A rule per action: `null` is admins only, `""` everyone. On update, other actions are kept. */
	rules: z.partialRecord(z.enum(API_RULE_ACTIONS), ruleSchema),
	thumbnails: z.object({
		enabled: z.boolean(),
		sizes: z.array(z.string().min(1)).max(50)
	})
};

/** Body of `POST /api/collections`. */
export const apiCreateCollectionSchema = z.object({
	name: collectionName,
	fields: apiCollectionFields.fields.default([]),
	indexes: apiCollectionFields.indexes.default([]),
	rules: apiCollectionFields.rules.default({}),
	thumbnails: apiCollectionFields.thumbnails.optional()
});

/** Body of `PATCH /api/collections/<name>`: only the given parts change. */
export const apiUpdateCollectionSchema = z.object({
	name: collectionName.optional(),
	fields: apiCollectionFields.fields.optional(),
	indexes: apiCollectionFields.indexes.optional(),
	rules: apiCollectionFields.rules.optional(),
	thumbnails: apiCollectionFields.thumbnails.optional()
});

export type ApiCreateCollection = z.infer<typeof apiCreateCollectionSchema>;
export type ApiUpdateCollection = z.infer<typeof apiUpdateCollectionSchema>;
