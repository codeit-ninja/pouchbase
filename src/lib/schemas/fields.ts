import { z } from 'zod';

import {
	FIELD_NAME_PATTERN,
	FIELD_TYPE_IDS,
	isReservedFieldName,
	RICH_TEXT_FORMATS,
	validateDefaultValue
} from '#lib/fields/field-types.js';

export const fieldName = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, 'Enter a name')
	.max(63, 'Name must be at most 63 characters')
	.regex(
		FIELD_NAME_PATTERN,
		'Start with a letter and use only lowercase letters, numbers and underscores'
	)
	.refine((name) => !isReservedFieldName(name), 'This name is reserved');

export const createFieldSchema = z
	.object({
		/** Collection name, sent as a hidden field. */
		collection: z.string(),
		name: fieldName,
		type: z.enum(FIELD_TYPE_IDS, 'Choose a type'),
		required: z.boolean().default(false),
		unique: z.boolean().default(false),
		defaultValue: z.string().optional(),
		/** Only used for rich text fields. */
		format: z.enum(RICH_TEXT_FORMATS).optional(),
		/** Only used for relation fields: id of the related collection. */
		relationCollection: z.string().optional(),
		/** Only used for relation fields. */
		multiple: z.boolean().default(false)
	})
	.superRefine((data, ctx) => {
		if (data.type === 'relation' && !data.relationCollection) {
			ctx.addIssue({
				code: 'custom',
				path: ['relationCollection'],
				message: 'Choose a collection'
			});
		}

		const message = data.defaultValue ? validateDefaultValue(data.type, data.defaultValue) : null;

		if (message) {
			ctx.addIssue({ code: 'custom', path: ['defaultValue'], message });
		}
	});

export const renameFieldSchema = z.object({
	/** Hidden fields. */
	collection: z.string(),
	name: z.string(),
	newName: fieldName
});

export const deleteFieldSchema = z.object({
	/** Hidden fields. */
	collection: z.string(),
	name: z.string()
});
