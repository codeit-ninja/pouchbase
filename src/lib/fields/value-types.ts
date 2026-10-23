import type { FieldOptions, FieldType } from './field-types';

import { idGenerator } from './field-types';

/**
 * The TypeScript type of a field's value as the records API returns it: the value stored in the
 * column, with a note for docs. `target` is the name of the collection a relation points to.
 * Used by the generated types and the API preview in the dashboard.
 */
export function fieldValueType(
	field: { type: FieldType; options: FieldOptions },
	target?: string
): { type: string; note?: string } {
	const items = field.options.values ?? [];

	switch (field.type) {
		case 'id':
			return idGenerator(field.options) === 'autoincrement'
				? { type: 'number', note: 'Unique id of the record.' }
				: { type: 'string', note: 'Unique id of the record.' };
		case 'created':
			return {
				type: 'number',
				note: 'When the record was created, in milliseconds since 1970 (UTC).'
			};
		case 'updated':
			return {
				type: 'number',
				note: 'When the record was last saved, in milliseconds since 1970 (UTC).'
			};
		case 'rich_text':
			return { type: 'string', note: field.options.format === 'markdown' ? 'Markdown.' : 'HTML.' };
		case 'date':
			return { type: 'string', note: 'ISO 8601 date and time in UTC.' };
		case 'number':
		case 'integer':
			return { type: 'number' };
		case 'boolean':
			return { type: '0 | 1', note: '1 for true, 0 for false.' };
		case 'json':
			return { type: 'string', note: 'JSON text; use `JSON.parse` to read it.' };
		case 'list':
			if (field.options.multiple) {
				return { type: 'string', note: 'JSON array of the selected items.' };
			}

			return {
				type: items.length > 0 ? items.map((item) => JSON.stringify(item)).join(' | ') : 'string',
				note: 'The selected item.'
			};
		case 'relation':
			return field.options.multiple
				? { type: 'string', note: `JSON array of ids of records in \`${target ?? '?'}\`.` }
				: { type: 'string', note: `Id of a record in \`${target ?? '?'}\`.` };
		case 'file':
			return field.options.multiple
				? { type: 'string', note: 'JSON array of ids of records in `files`.' }
				: { type: 'string', note: 'Id of a record in `files`.' };
		case 'computed':
			return { type: 'string', note: 'Calculated when the record is saved.' };
		case 'blob':
			return { type: 'unknown', note: 'Binary data; the records API leaves it out.' };
		default:
			return { type: 'string' };
	}
}
