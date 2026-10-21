/**
 * Field types of a collection. Each type maps onto one of D1's (SQLite's) storage classes and adds
 * its own meaning and validation on top, similar to PocketBase.
 *
 * Shared between the client (forms, icons) and the server (column definitions).
 */

export type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';

export type FieldTypeDefinition = {
	label: string;
	description: string;
	/** Iconify name; literal so the icon bundler can find it. */
	icon: string;
	column: ColumnType;
	/** Whether the type supports a default value. */
	defaultable: boolean;
};

export const FIELD_TYPES = {
	text: {
		label: 'Text',
		description: 'Plain text.',
		icon: 'lucide:type',
		column: 'TEXT',
		defaultable: true
	},
	rich_text: {
		label: 'Rich text',
		description: 'Formatted text from the editor, stored as HTML or Markdown.',
		icon: 'lucide:pilcrow',
		column: 'TEXT',
		defaultable: true
	},
	number: {
		label: 'Number',
		description: 'Decimal number.',
		icon: 'lucide:hash',
		column: 'REAL',
		defaultable: true
	},
	integer: {
		label: 'Integer',
		description: 'Whole number.',
		icon: 'lucide:binary',
		column: 'INTEGER',
		defaultable: true
	},
	boolean: {
		label: 'Boolean',
		description: 'True or false, stored as 1 or 0.',
		icon: 'lucide:toggle-left',
		column: 'INTEGER',
		defaultable: true
	},
	date: {
		label: 'Date',
		description: 'Date and time, stored as ISO 8601 text.',
		icon: 'lucide:calendar',
		column: 'TEXT',
		defaultable: true
	},
	email: {
		label: 'Email',
		description: 'Email address.',
		icon: 'lucide:at-sign',
		column: 'TEXT',
		defaultable: true
	},
	url: {
		label: 'URL',
		description: 'Web address.',
		icon: 'lucide:link',
		column: 'TEXT',
		defaultable: true
	},
	json: {
		label: 'JSON',
		description: 'Any JSON value, validated by the database.',
		icon: 'lucide:braces',
		column: 'TEXT',
		defaultable: true
	},
	relation: {
		label: 'Relation',
		description: 'Links to one or more records of another collection.',
		icon: 'lucide:link-2',
		column: 'TEXT',
		defaultable: false
	},
	blob: {
		label: 'Blob',
		description: 'Binary data.',
		icon: 'lucide:file',
		column: 'BLOB',
		defaultable: false
	}
} as const satisfies Record<string, FieldTypeDefinition>;

export type FieldType = keyof typeof FIELD_TYPES;

export const FIELD_TYPE_IDS = Object.keys(FIELD_TYPES) as [FieldType, ...FieldType[]];

export const RICH_TEXT_FORMATS = ['html', 'markdown'] as const;

export type RichTextFormat = (typeof RICH_TEXT_FORMATS)[number];

export type FieldOptions = {
	/** Only for `rich_text`. */
	format?: RichTextFormat;
	/** Only for `relation`: id of the related collection. */
	collectionId?: string;
	/** Only for `relation`: stores a JSON array of ids instead of a single id. */
	multiple?: boolean;
};

/** Columns every collection table has; field names can't use them. */
export const SYSTEM_FIELDS = ['id', 'created_at', 'updated_at'] as const;

const RESERVED_NAMES = new Set<string>([...SYSTEM_FIELDS, 'rowid', 'oid', '_rowid_']);

/** Field names are column names, so they are restricted to a safe identifier. */
export const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export function isReservedFieldName(name: string) {
	return RESERVED_NAMES.has(name);
}

/**
 * Checks a default value (as typed in a form) against the field type.
 *
 * @returns An error message, or `null` when the value is valid.
 */
export function validateDefaultValue(type: FieldType, value: string): string | null {
	switch (type) {
		case 'blob':
		case 'relation':
			return `${FIELD_TYPES[type].label} fields have no default value`;
		case 'number':
			return value.trim() !== '' && Number.isFinite(Number(value)) ? null : 'Enter a number';
		case 'integer':
			return /^-?\d+$/.test(value.trim()) ? null : 'Enter a whole number';
		case 'boolean':
			return value === 'true' || value === 'false' ? null : 'Enter true or false';
		case 'date':
			return Number.isNaN(Date.parse(value)) ? 'Enter a date, e.g. 2026-01-31' : null;
		case 'email':
			return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Enter an email address';
		case 'url':
			return URL.canParse(value) ? null : 'Enter a URL, e.g. https://example.com';
		case 'json':
			try {
				JSON.parse(value);

				return null;
			} catch {
				return 'Enter valid JSON';
			}
		default:
			return null;
	}
}
