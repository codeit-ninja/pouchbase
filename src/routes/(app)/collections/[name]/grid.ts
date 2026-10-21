import type { FieldOptions, FieldType } from '#lib/fields/field-types.js';

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
	/** Auth fields of the built-in `users` collection can't be renamed or deleted. */
	system: boolean;
};

export type RelationRef = { id: string; label: string };

export type GridValue = string | number | null | RelationRef[];

export type GridRecord = { id: string; created_at: number; updated_at: number } & {
	[column: string]: GridValue;
};

/** A column of the grid: one of the system columns or a field. */
export type GridColumn = {
	name: string;
	label: string;
	icon: string;
	/** Undefined for system columns. */
	field?: GridField;
	sortable: boolean;
	/** Read-only column that isn't stored in the table, e.g. the sign-in methods of users. */
	virtual?: 'sign-in';
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

export const SYSTEM_COLUMNS: GridColumn[] = [
	{ name: 'id', label: 'Text', icon: 'lucide:key-round', sortable: true },
	{ name: 'created_at', label: 'Created', icon: 'lucide:clock', sortable: true },
	{ name: 'updated_at', label: 'Updated', icon: 'lucide:clock', sortable: true }
];

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
