import type { FieldOptions, FieldType } from '#lib/fields/field-types.js';

import { resolve } from '$app/paths';

import { FIELD_TYPES } from '#lib/fields/field-types.js';

/** A field as returned by `listRecords`. */
export type GridField = {
	id: string;
	name: string;
	type: FieldType;
	required: boolean;
	unique: boolean;
	defaultValue: string | null;
	options: FieldOptions;
	/** Fields of built-in collections (like `users`) can't be renamed or deleted. */
	system: boolean;
};

export type RelationRef = { id: string; label: string };

export type GridValue = string | number | null | RelationRef[];

/**
 * A record with a value per field. `_key` identifies it: the value of its ID field, or its row
 * number when the collection has none. Field names start with a letter, so it never collides.
 */
export type GridRecord = { _key: string } & {
	[column: string]: GridValue;
};

/** A column of the grid: a field, or a virtual column of a built-in collection. */
export type GridColumn = {
	name: string;
	label: string;
	icon: string;
	/** Undefined for virtual columns. */
	field?: GridField;
	sortable: boolean;
	/** Read-only column that isn't stored in the table, e.g. the sign-in methods of users. */
	virtual?: 'sign-in' | 'preview';
	/** Collection a relation field points to, e.g. `files` (shows thumbnails). */
	relationTarget?: string;
	/** Show the value as a file size (`size` of the built-in `files` collection). */
	fileSize?: boolean;
};

/**
 * Sign-in methods of the built-in `users` collection (linked OAuth accounts and passwords).
 * Field names can't start with `_`, so this name never collides with a field.
 */
export const SIGN_IN_COLUMN: GridColumn = {
	name: '_sign_in',
	label: 'Sign-in',
	icon: 'lucide:shield-check',
	sortable: false,
	virtual: 'sign-in'
};

/** Thumbnail of the built-in `files` collection's records. */
export const PREVIEW_COLUMN: GridColumn = {
	name: '_preview',
	label: 'Preview',
	icon: 'lucide:image',
	sortable: false,
	virtual: 'preview'
};

export function fieldColumn(field: GridField): GridColumn {
	const type = FIELD_TYPES[field.type];

	return {
		name: field.name,
		label: type.label,
		icon: type.icon,
		field,
		sortable: field.type !== 'blob'
	};
}

/** Link that opens a record in its collection's record sheet. */
export function recordHref(collection: string, id: string) {
	const search = new URLSearchParams({ record: id });

	return resolve(`/(app)/collections/[name]?${search}`, { name: collection });
}

/** When the record was last saved: its first `updated` field, if the collection has one. */
export function lastUpdated(record: GridRecord, fields: GridField[]) {
	const field = fields.find((candidate) => candidate.type === 'updated');
	const value = field ? record[field.name] : null;

	return typeof value === 'number' ? value : undefined;
}

/** `2026-01-31 14:05:09` in UTC, so server and browser render the same text. */
export function formatTimestamp(value: number | string) {
	const date = new Date(value);

	return Number.isNaN(date.getTime())
		? String(value)
		: date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Plain text preview of rich text content. */
export function plainText(value: string) {
	return value
		.replace(/<[^>]+>/g, ' ')
		.replace(/[#*_`>~-]+/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}
