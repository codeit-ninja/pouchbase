import type { FieldOptions, FieldType } from './field-types';

import { idGenerator } from './field-types';

/**
 * The TypeScript type of a field's value as the records API returns it, with a note for docs:
 * booleans are `boolean`, JSON fields are parsed (`JsonValue`, declared in the generated types),
 * and multiple relations, files and lists are arrays. `target` is the name of the collection a
 * relation points to. Used by the generated types and the API preview in the dashboard.
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
			return { type: 'boolean' };
		case 'json':
			return { type: 'JsonValue', note: 'Any JSON value.' };
		case 'list': {
			const item =
				items.length > 0 ? items.map((value) => JSON.stringify(value)).join(' | ') : 'string';

			return field.options.multiple
				? { type: items.length > 1 ? `(${item})[]` : `${item}[]`, note: 'The selected items.' }
				: { type: item, note: 'The selected item.' };
		}
		case 'relation':
			return field.options.multiple
				? { type: 'string[]', note: `Ids of records in \`${target ?? '?'}\`.` }
				: { type: 'string', note: `Id of a record in \`${target ?? '?'}\`.` };
		case 'file':
			return field.options.multiple
				? { type: 'string[]', note: 'Ids of records in `files`.' }
				: { type: 'string', note: 'Id of a record in `files`.' };
		case 'computed':
			return { type: 'string', note: 'Calculated when the record is saved.' };
		case 'blob':
			return { type: 'unknown', note: 'Binary data; the records API leaves it out.' };
		default:
			return { type: 'string' };
	}
}
