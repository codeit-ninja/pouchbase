/**
 * Field types of a collection. Each type maps onto one of D1's (SQLite's) storage classes and adds
 * its own meaning and validation on top.
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
	id: {
		label: 'ID',
		description: 'Unique key of each record, generated when it is created. One per collection.',
		icon: 'lucide:key-round',
		column: 'TEXT',
		defaultable: false
	},
	created: {
		label: 'Created',
		description: 'Set to the time the record is created.',
		icon: 'lucide:clock',
		column: 'INTEGER',
		defaultable: false
	},
	updated: {
		label: 'Updated',
		description: 'Set to the time the record is last saved.',
		icon: 'lucide:clock',
		column: 'INTEGER',
		defaultable: false
	},
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
	list: {
		label: 'List',
		description: 'One or more items picked from a fixed list.',
		icon: 'lucide:list',
		column: 'TEXT',
		defaultable: true
	},
	relation: {
		label: 'Relation',
		description: 'Links to one or more records of another collection.',
		icon: 'lucide:link-2',
		column: 'TEXT',
		defaultable: true
	},
	file: {
		label: 'File',
		description: 'An uploaded file, stored in the files collection.',
		icon: 'lucide:paperclip',
		column: 'TEXT',
		defaultable: false
	},
	computed: {
		label: 'Computed',
		description: 'Calculated from another field when a record is saved, e.g. a slug.',
		icon: 'lucide:square-function',
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

/**
 * Field types whose value is filled in by Pouchbase when a record is saved: the record's key and
 * its timestamps (milliseconds since the epoch). They have no required, unique or default setting.
 * A collection has at most one `id` field; without one, records are identified by SQLite's `rowid`
 * and relation fields can't point to it.
 */
export const AUTO_FIELD_TYPES = new Set<FieldType>(['id', 'created', 'updated']);

export function isAutoType(type: FieldType) {
	return AUTO_FIELD_TYPES.has(type);
}

/** How an `id` field generates the key of a new record. */
export const ID_GENERATORS = {
	autoincrement: {
		label: 'Auto-increment',
		description: '1, 2, 3, … stored as an integer. Numbers of deleted records are never reused.'
	},
	uuid: {
		label: 'UUID v4',
		description: 'Random UUID, e.g. 9b2f0c1e-6a4d-4f3b-8e7a-2d5c1b0a9f8e.'
	},
	uuidv7: {
		label: 'UUID v7',
		description: 'UUID that starts with the creation time, so new records sort last.'
	},
	random: {
		label: 'Random string',
		description: '15 lowercase letters and numbers, e.g. k3x9qm2v8tz4np1.'
	}
} as const satisfies Record<string, { label: string; description: string }>;

export type IdGenerator = keyof typeof ID_GENERATORS;

export const ID_GENERATOR_IDS = Object.keys(ID_GENERATORS) as [IdGenerator, ...IdGenerator[]];

/** The generator of an `id` field; fields from before generators existed use random strings. */
export function idGenerator(options: FieldOptions): IdGenerator {
	return options.generator ?? 'random';
}

/**
 * Fields the built-in collections (`users`, `files`) are created with. Collections you create
 * start without fields.
 */
export const BUILT_IN_DEFAULT_FIELDS = [
	{ name: 'id', type: 'id', options: { generator: 'random' } },
	{ name: 'created_at', type: 'created', options: {} },
	{ name: 'updated_at', type: 'updated', options: {} }
] as const satisfies { name: string; type: FieldType; options: FieldOptions }[];

/** Default value of a date field that stands for the moment the record is created. */
export const NOW_DEFAULT = '@now';

/**
 * What deleting a record does to the records that link to it through a relation field: unlink it
 * (the field becomes empty, or loses the id when it allows multiple), delete them too, or refuse
 * the delete while any record links to it.
 */
export const RELATION_ON_DELETE = {
	set_null: {
		label: 'Unlink',
		description: 'Remove the link; the records that linked to it stay.'
	},
	cascade: {
		label: 'Cascade',
		description: 'Delete the records that link to it too.'
	},
	restrict: {
		label: 'Restrict',
		description: "Don't allow the delete while records link to it."
	}
} as const satisfies Record<string, { label: string; description: string }>;

export type RelationOnDelete = keyof typeof RELATION_ON_DELETE;

export const RELATION_ON_DELETE_IDS = Object.keys(RELATION_ON_DELETE) as [
	RelationOnDelete,
	...RelationOnDelete[]
];

/** What deleting a related record does to a relation field; fields from before this unlink. */
export function relationOnDelete(options: FieldOptions): RelationOnDelete {
	return options.onDelete ?? 'set_null';
}

export const RICH_TEXT_FORMATS = ['html', 'markdown'] as const;

export type RichTextFormat = (typeof RICH_TEXT_FORMATS)[number];

export type FieldOptions = {
	/** Only for `id`: how the key of a new record is generated. */
	generator?: IdGenerator;
	/** Only for `rich_text`. */
	format?: RichTextFormat;
	/** Only for `relation`: id of the related collection. */
	collectionId?: string;
	/**
	 * Only for `relation`: what happens to records of this collection when a record they link to is
	 * deleted. Missing means `set_null` (see `relationOnDelete`).
	 */
	onDelete?: RelationOnDelete;
	/**
	 * Only for `relation` and `list`: stores a JSON array of ids or items instead of a single
	 * value.
	 */
	multiple?: boolean;
	/** Only for `list`: the items a record can pick from, in display order. */
	values?: string[];
	/**
	 * Only for `file`: accepted MIME types, wildcards and extensions, e.g. `["image/*", ".pdf"]`
	 * (see `#lib/files/accept.js`). Empty or missing accepts every file.
	 */
	accept?: string[];
	/** Only for `file`: largest upload in bytes, at most `MAX_FILE_SIZE`. Missing means that limit. */
	maxSize?: number;
	/** Only for `computed`: name of the field the value is calculated from (not for `script`). */
	source?: string;
	/** Only for `computed`: how the source value is turned into this field's value. */
	transform?: ComputedTransform;
	/**
	 * Only for `computed` with the `script` transform: the body of a JavaScript function of
	 * `record` and `ctx` that returns the value.
	 */
	script?: string;
	/**
	 * The default value is a SQLite expression, evaluated when a record is created (see
	 * `./sql-expression.ts`), e.g. `datetime('now', '+7 days')`.
	 */
	defaultSql?: boolean;
};

/**
 * Field types whose value is the id of a record in another collection: relations, and file fields,
 * which are relations to the built-in `files` collection.
 */
export function isRelationType(type: FieldType) {
	return type === 'relation' || type === 'file';
}

/** Most items a list field can have. */
export const MAX_LIST_VALUES = 200;

/** Longest item of a list field, in characters. */
export const MAX_LIST_VALUE_LENGTH = 100;

/**
 * The items of a list field from a form: a JSON array of strings. Items are trimmed; blanks and
 * repeats are dropped.
 */
export function parseListValues(json: string | undefined): string[] {
	let parsed: unknown;

	try {
		parsed = JSON.parse(json || '[]');
	} catch {
		return [];
	}

	return Array.isArray(parsed)
		? [...new Set(parsed.map((item) => String(item).trim()))].filter(Boolean)
		: [];
}

/**
 * The selected items of a stored list value: a JSON array for lists that allow multiple items,
 * otherwise a single item.
 */
export function listSelection(value: unknown, multiple: boolean | undefined): string[] {
	if (typeof value !== 'string' || value === '') {
		return [];
	}

	if (!multiple) {
		return [value];
	}

	try {
		const parsed: unknown = JSON.parse(value);

		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

/** How a computed field turns its source value into its own value. */
export const COMPUTED_TRANSFORMS = {
	slug: {
		label: 'Slug',
		description: 'Lowercase words joined by dashes, e.g. hello-world.'
	},
	lowercase: { label: 'Lowercase', description: 'The source text in lowercase.' },
	uppercase: { label: 'Uppercase', description: 'The source text in uppercase.' },
	script: {
		label: 'Script',
		description: 'A JavaScript function that gets the whole record.'
	}
} as const satisfies Record<string, { label: string; description: string }>;

/** Longest script a computed field can have, in characters. */
export const MAX_SCRIPT_LENGTH = 10_000;

/** Starting point for a new script. */
export const SCRIPT_TEMPLATE = [
	'// `record` has every field of the collection.',
	'// `ctx` has the collection, isNew, the previous record and helpers such as slugify.',
	'// Return the value of this field.',
	'return ctx.slugify(String(record.id));',
	''
].join('\n');

/** Whether a computed field is calculated from a single source field (not a script). */
export function hasComputedSource(transform: ComputedTransform | undefined) {
	return !!transform && transform !== 'script';
}

export type ComputedTransform = keyof typeof COMPUTED_TRANSFORMS;

export const COMPUTED_TRANSFORM_IDS = Object.keys(COMPUTED_TRANSFORMS) as [
	ComputedTransform,
	...ComputedTransform[]
];

/** Field types a computed field can be calculated from. */
export const COMPUTED_SOURCE_TYPES = new Set<FieldType>([
	'text',
	'rich_text',
	'email',
	'url',
	'number',
	'integer',
	'date'
]);

/** `Héllo, Wörld!` → `hello-world`. */
export function slugify(value: string) {
	return (
		value
			.normalize('NFKD')
			// Drops the accents that NFKD split off, so `é` becomes `e`.
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
	);
}

/**
 * The value of a computed field for a stored source value; `null` when there is nothing to
 * compute from. Rich text is reduced to its text first.
 */
export function computeValue(
	transform: ComputedTransform,
	sourceType: FieldType,
	value: unknown
): string | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}

	let text = String(value);

	if (sourceType === 'rich_text') {
		text = text
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/[#*_`>~]+/g, ' ');
	}

	text = text.replace(/\s+/g, ' ').trim();

	switch (transform) {
		case 'script':
			// Scripts run in a sandbox on the server, not here.
			return null;
		case 'slug':
			text = slugify(text);
			break;
		case 'lowercase':
			text = text.toLowerCase();
			break;
		case 'uppercase':
			text = text.toUpperCase();
			break;
	}

	return text === '' ? null : text;
}

/** SQLite's names for the hidden row key; field names can't use them. */
const RESERVED_NAMES = new Set<string>(['rowid', 'oid', '_rowid_']);

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
		case 'id':
		case 'created':
		case 'updated':
		case 'blob':
		case 'file':
		case 'computed':
			return `${FIELD_TYPES[type].label} fields have no default value`;
		case 'number':
			return value.trim() !== '' && Number.isFinite(Number(value)) ? null : 'Enter a number';
		case 'integer':
			return /^-?\d+$/.test(value.trim()) ? null : 'Enter a whole number';
		case 'boolean':
			return value === 'true' || value === 'false' ? null : 'Enter true or false';
		case 'date':
			return value === NOW_DEFAULT || !Number.isNaN(Date.parse(value))
				? null
				: `Enter a date, e.g. 2026-01-31, or ${NOW_DEFAULT}`;
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
