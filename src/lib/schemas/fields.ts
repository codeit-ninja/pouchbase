import { z } from 'zod';

import {
	COMPUTED_TRANSFORM_IDS,
	FIELD_NAME_PATTERN,
	FIELD_TYPE_IDS,
	hasComputedSource,
	ID_GENERATOR_IDS,
	MAX_LIST_VALUE_LENGTH,
	MAX_LIST_VALUES,
	MAX_SCRIPT_LENGTH,
	isReservedFieldName,
	parseListValues,
	RICH_TEXT_FORMATS,
	validateDefaultValue
} from '#lib/fields/field-types.js';
import { checkSqlExpression, SQL_DEFAULT_TYPES } from '#lib/fields/sql-expression.js';
import { FILE_TYPE_PRESET_IDS, FILE_TYPE_PRESETS, parseFileTypes } from '#lib/files/accept.js';
import { MAX_FILE_SIZE } from '#lib/files/files.js';

const MB = 1024 * 1024;

/** The largest upload a file field can allow, in MB (the global upload limit). */
export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / MB;

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

/** The preset ids in the JSON array the multi-select submits; unknown ids are dropped. */
function parsePresets(json: string | undefined) {
	try {
		const parsed: unknown = JSON.parse(json || '[]');

		return Array.isArray(parsed) ? FILE_TYPE_PRESET_IDS.filter((id) => parsed.includes(id)) : [];
	} catch {
		return [];
	}
}

/** How a computed field is calculated; shared by the add-field and edit-computed forms. */
const computeFields = {
	/** The field the value is calculated from (not for scripts). */
	computeSource: z.string().optional(),
	computeTransform: z.enum(COMPUTED_TRANSFORM_IDS).optional(),
	/** Only for the `script` transform: a JavaScript function of the record. */
	computeScript: z
		.string()
		.max(MAX_SCRIPT_LENGTH, `Scripts can be at most ${MAX_SCRIPT_LENGTH} characters`)
		.optional()
};

type ComputeData = {
	computeSource?: string;
	computeTransform?: (typeof COMPUTED_TRANSFORM_IDS)[number];
	computeScript?: string;
};

function checkCompute(data: ComputeData, ctx: z.RefinementCtx) {
	if (!data.computeTransform) {
		ctx.addIssue({ code: 'custom', path: ['computeTransform'], message: 'Choose how to compute' });
	} else if (hasComputedSource(data.computeTransform) && !data.computeSource) {
		ctx.addIssue({ code: 'custom', path: ['computeSource'], message: 'Choose a field' });
	} else if (!hasComputedSource(data.computeTransform) && !data.computeScript?.trim()) {
		ctx.addIssue({ code: 'custom', path: ['computeScript'], message: 'Write a script' });
	}
}

/** The `options` of a computed field, from a form with the compute fields. */
export function computeOptions(data: ComputeData) {
	return hasComputedSource(data.computeTransform)
		? { transform: data.computeTransform, source: data.computeSource }
		: { transform: data.computeTransform, script: data.computeScript };
}

export const updateComputedSchema = z
	.object({
		/** Hidden fields. */
		collection: z.string(),
		name: z.string(),
		...computeFields
	})
	.superRefine(checkCompute);

/** Runs a calculation on the newest records without saving, to try it out. */
export const previewComputedSchema = z.object({
	collection: z.string(),
	computeSource: z.string().optional(),
	computeTransform: z.enum(COMPUTED_TRANSFORM_IDS),
	computeScript: z.string().max(MAX_SCRIPT_LENGTH).optional()
});

/**
 * The settings of a field that depend on its type; shared by the add-field and edit-field forms.
 * Each is only used by the types named.
 */
const settingsFields = {
	/** id fields. */
	idGenerator: z.enum(ID_GENERATOR_IDS).optional(),
	defaultValue: z.string().optional(),
	/** The default value is a SQLite expression (see `#lib/fields/sql-expression.js`). */
	defaultSql: z.boolean().default(false),
	/** Rich text fields. */
	format: z.enum(RICH_TEXT_FORMATS).optional(),
	/** Relation and list fields. */
	multiple: z.boolean().default(false),
	/** List fields: JSON array of the items, in order. */
	listValues: z.string().optional(),
	/** File fields: JSON array of `FILE_TYPE_PRESETS` ids. */
	fileTypes: z.string().optional(),
	/** File fields: extra MIME types and extensions, e.g. `application/json, .md`. */
	customFileTypes: z.string().optional(),
	/** File fields: largest upload in MB; empty means the global limit. */
	maxFileSize: z
		.number('Enter a size in MB')
		.positive('Enter a size above 0')
		.max(MAX_FILE_SIZE_MB, `Uploads can be at most ${MAX_FILE_SIZE_MB} MB`)
		.optional()
};

type SettingsData = {
	type: (typeof FIELD_TYPE_IDS)[number];
	idGenerator?: (typeof ID_GENERATOR_IDS)[number];
	defaultValue?: string;
	defaultSql?: boolean;
	listValues?: string;
	customFileTypes?: string;
};

function checkSettings(data: SettingsData, ctx: z.RefinementCtx) {
	if (data.type === 'id' && !data.idGenerator) {
		ctx.addIssue({ code: 'custom', path: ['idGenerator'], message: 'Choose a generator' });
	}

	if (data.type === 'file') {
		const { invalid } = parseFileTypes(data.customFileTypes ?? '');

		if (invalid.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['customFileTypes'],
				message: `Not a MIME type or extension: ${invalid.join(', ')}`
			});
		}
	}

	if (data.type === 'list') {
		const values = parseListValues(data.listValues);
		const tooLong = values.find((value) => value.length > MAX_LIST_VALUE_LENGTH);

		if (!values.length) {
			ctx.addIssue({ code: 'custom', path: ['listValues'], message: 'Add at least one item' });
		} else if (values.length > MAX_LIST_VALUES) {
			ctx.addIssue({
				code: 'custom',
				path: ['listValues'],
				message: `A list can have at most ${MAX_LIST_VALUES} items`
			});
		} else if (tooLong) {
			ctx.addIssue({
				code: 'custom',
				path: ['listValues'],
				message: `Items can be at most ${MAX_LIST_VALUE_LENGTH} characters: ${tooLong.slice(0, 20)}…`
			});
		} else if (data.defaultValue && !values.includes(data.defaultValue)) {
			ctx.addIssue({
				code: 'custom',
				path: ['defaultValue'],
				message: 'Choose one of the items'
			});
		}
	}

	const message = !data.defaultValue
		? null
		: data.defaultSql
			? SQL_DEFAULT_TYPES.has(data.type)
				? checkSqlExpression(data.defaultValue)
				: 'This type has no SQL default'
			: validateDefaultValue(data.type, data.defaultValue);

	if (message) {
		ctx.addIssue({ code: 'custom', path: ['defaultValue'], message });
	}
}

export const createFieldSchema = z
	.object({
		/** Collection name, sent as a hidden field. */
		collection: z.string(),
		name: fieldName,
		type: z.enum(FIELD_TYPE_IDS, 'Choose a type'),
		required: z.boolean().default(false),
		unique: z.boolean().default(false),
		/** Only used for relation fields: id of the related collection. */
		relationCollection: z.string().optional(),
		...settingsFields,
		...computeFields
	})
	.superRefine((data, ctx) => {
		if (data.type === 'computed') {
			checkCompute(data, ctx);
		}

		if (data.type === 'relation' && !data.relationCollection) {
			ctx.addIssue({
				code: 'custom',
				path: ['relationCollection'],
				message: 'Choose a collection'
			});
		}

		checkSettings(data, ctx);
	});

/**
 * Changes the type-specific settings of an existing field (see `settingsFields`); its name,
 * required and unique are edited in the edit collection sheet itself.
 */
export const updateFieldSchema = z
	.object({
		/** Hidden fields: the collection, the field and its type (which can't change). */
		collection: z.string(),
		name: z.string(),
		type: z.enum(FIELD_TYPE_IDS),
		...settingsFields
	})
	.superRefine(checkSettings);

export type UpdateFieldData = z.infer<typeof updateFieldSchema>;

export type CreateFieldData = z.infer<typeof createFieldSchema>;

/** The `accept` and `maxSize` options of a file field, from the add-field or edit-field form. */
export function fileFieldOptions(data: CreateFieldData | UpdateFieldData) {
	const presets = parsePresets(data.fileTypes).flatMap((id) => FILE_TYPE_PRESETS[id].rules);
	const custom = parseFileTypes(data.customFileTypes ?? '').rules;

	return {
		accept: [...new Set([...presets, ...custom])],
		maxSize: data.maxFileSize ? Math.round(data.maxFileSize * MB) : undefined
	};
}

/** The `values` and `multiple` options of a list field, from the add-field or edit-field form. */
export function listFieldOptions(data: CreateFieldData | UpdateFieldData) {
	return { values: parseListValues(data.listValues), multiple: data.multiple };
}

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

export const updateFieldsSchema = z
	.object({
		/** Collection name, sent as a hidden field. */
		collection: z.string(),
		/** Every field of the collection, in the new display order. */
		fields: z.array(
			z.object({
				/** Hidden field. */
				id: z.string(),
				name: fieldName,
				required: z.boolean().default(false),
				unique: z.boolean().default(false),
				/** Hidden field: drop the field when saving. */
				remove: z.boolean().default(false)
			})
		)
	})
	.superRefine((data, ctx) => {
		const seen = new Set<string>();

		for (const [index, field] of data.fields.entries()) {
			if (field.remove) {
				continue;
			}

			if (seen.has(field.name)) {
				ctx.addIssue({
					code: 'custom',
					path: ['fields', index, 'name'],
					message: 'Another field already has this name'
				});
			}

			seen.add(field.name);
		}
	});
