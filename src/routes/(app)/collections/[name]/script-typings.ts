import type { FieldType } from '#lib/fields/field-types.js';
import type { GridField } from './grid';

import { FIELD_TYPES, idGenerator } from '#lib/fields/field-types.js';

/** How each field type reaches a script: the value as it is stored in the column. */
function valueType(field: GridField): { type: string; note?: string } | null {
	const types: Record<FieldType, { type: string; note?: string } | null> = {
		id:
			idGenerator(field.options) === 'autoincrement'
				? {
						type: 'number | undefined',
						note: 'Unique id of the record; not known yet while it is created.'
					}
				: { type: 'string', note: 'Unique id of the record.' },
		created: {
			type: 'number | null',
			note: 'When the record was created, in milliseconds since 1970 (UTC).'
		},
		updated: {
			type: 'number | null',
			note: 'When the record was last saved, in milliseconds since 1970 (UTC).'
		},
		text: { type: 'string | null' },
		rich_text: {
			type: 'string | null',
			note: field.options.format === 'markdown' ? 'Markdown.' : 'HTML.'
		},
		email: { type: 'string | null' },
		url: { type: 'string | null' },
		date: { type: 'string | null', note: 'ISO 8601 date and time in UTC.' },
		number: { type: 'number | null' },
		integer: { type: 'number | null' },
		boolean: { type: '0 | 1 | null', note: '1 for true, 0 for false.' },
		json: { type: 'string | null', note: 'JSON text; use `JSON.parse` to read it.' },
		list: field.options.multiple
			? { type: 'string | null', note: 'JSON array of the selected items.' }
			: { type: 'string | null', note: 'The selected item.' },
		relation: field.options.multiple
			? { type: 'string | null', note: 'JSON array of record ids.' }
			: { type: 'string | null', note: 'Id of the related record.' },
		file: field.options.multiple
			? { type: 'string | null', note: 'JSON array of ids of records in `files`.' }
			: { type: 'string | null', note: 'Id of a record in `files`.' },
		computed: { type: 'string | null', note: 'Computed; the value from before this save.' },
		// Blobs can be large, so scripts don't get them.
		blob: null
	};

	return types[field.type] ?? { type: 'unknown' };
}

/**
 * TypeScript declarations for the script of a computed field: `record` with every field of the
 * collection and `ctx`, so the code editor can suggest and check them. Mirrors what
 * `src/lib/server/scripts.ts` passes in.
 */
export function scriptTypings(collection: string, fields: GridField[]) {
	const members = fields.flatMap((field) => {
		const value = valueType(field);

		if (!value) {
			return [];
		}

		const doc = [`\`${field.name}\` · ${FIELD_TYPES[field.type].label}.`, value.note]
			.filter(Boolean)
			.join(' ');

		return [`\t/** ${doc} */`, `\treadonly ${field.name}: ${value.type};`];
	});

	return `
/** A record of \`${collection}\`, as stored. */
interface CollectionRecord {
${members.join('\n')}
}

interface ComputeContext {
	/** Name of the collection: \`${collection}\`. */
	readonly collection: string;
	/** True while the record is being created. */
	readonly isNew: boolean;
	/** The stored record before this save; \`null\` for a new record. */
	readonly previous: CollectionRecord | null;
	/** Turns text into a URL slug: \`Héllo, Wörld!\` becomes \`hello-world\`. */
	slugify(text: string): string;
}

/** The record being saved, with the values of this save. */
declare const record: CollectionRecord;
/** Information about the save, and helpers. */
declare const ctx: ComputeContext;
`;
}
