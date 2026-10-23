import type { GridField } from './grid';
import type { ApiRuleAction } from '#lib/filter/rules.js';

import { isAutoType } from '#lib/fields/field-types.js';
import { fieldValueType } from '#lib/fields/value-types.js';
import { apiActions, protectedApiFields } from '#lib/filter/rules.js';

/**
 * Documentation of the records API for one collection, as shown in the API preview: per action
 * the endpoint, its parameters, SDK and cURL examples and example responses, built from the
 * collection's fields.
 */

export type ApiParam = { name: string; type: string; required?: boolean; description: string };

export type ApiExample = {
	action: ApiRuleAction;
	description: string;
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	path: string;
	sdk: string;
	curl: string;
	queryParams: ApiParam[];
	bodyParams: ApiParam[];
	responses: { status: number; description: string; body: string | null }[];
};

type Collection = { name: string; system: boolean };

const EXAMPLE_TIME = Date.UTC(2026, 0, 15, 9, 30);

/** An example of a field's value as the API returns it. */
function exampleValue(field: GridField): string | number {
	const items = field.options.values ?? [];

	switch (field.type) {
		case 'id':
			return field.options.generator === 'autoincrement' ? 1 : 'k3x9f2m8q1w7z4p';
		case 'created':
		case 'updated':
			return EXAMPLE_TIME;
		case 'rich_text':
			return field.options.format === 'markdown' ? '**Hello**' : '<p>Hello</p>';
		case 'number':
			return 12.5;
		case 'integer':
			return 42;
		case 'boolean':
			return 1;
		case 'date':
			return new Date(EXAMPLE_TIME).toISOString();
		case 'email':
			return 'ada@example.com';
		case 'url':
			return 'https://example.com';
		case 'json':
			return '{"key":"value"}';
		case 'list':
			return field.options.multiple ? JSON.stringify(items.slice(0, 2)) : (items[0] ?? 'item');
		case 'relation':
		case 'file':
			return field.options.multiple ? '["RECORD_ID_1","RECORD_ID_2"]' : 'RECORD_ID';
		case 'computed':
			return 'computed value';
		default:
			return 'Hello';
	}
}

/** An example of a value to send for a field. */
function exampleInput(field: GridField): unknown {
	switch (field.type) {
		case 'boolean':
			return true;
		case 'json':
			return { key: 'value' };
		case 'list':
			return field.options.multiple
				? (field.options.values ?? []).slice(0, 2)
				: (field.options.values?.[0] ?? 'item');
		case 'relation':
		case 'file':
			return field.options.multiple ? ['RECORD_ID_1', 'RECORD_ID_2'] : 'RECORD_ID';
		default:
			return exampleValue(field);
	}
}

/** The type of a value to send, which can be more lenient than what is stored. */
function inputType(field: GridField, relationTargets: Record<string, string>) {
	const { type } = fieldValueType(field, relationTargets[field.name]);

	switch (field.type) {
		case 'boolean':
			return 'boolean';
		case 'json':
			return 'any JSON';
		case 'list':
		case 'relation':
		case 'file':
			return field.options.multiple ? 'string[]' : type;
		default:
			return type;
	}
}

/** JSON written as a JavaScript object literal, with unquoted keys where possible. */
function objectLiteral(value: unknown, indent: string) {
	return JSON.stringify(value, null, '\t')
		.replace(/^(\t+)"([a-z_][a-z0-9_]*)":/gm, '$1$2:')
		.replace(/\n/g, `\n${indent}`);
}

function json(value: unknown) {
	return JSON.stringify(value, null, 2);
}

/** The documentation of every action the records API offers for this collection. */
export function apiExamples(
	collection: Collection,
	fields: GridField[],
	relationTargets: Record<string, string>,
	origin: string
): ApiExample[] {
	const readable = fields.filter((field) => field.type !== 'blob');
	const protectedFields = protectedApiFields(collection);
	const writable = readable.filter(
		(field) =>
			!isAutoType(field.type) && field.type !== 'computed' && !protectedFields.includes(field.name)
	);
	const record = Object.fromEntries(readable.map((field) => [field.name, exampleValue(field)]));
	const body = Object.fromEntries(writable.map((field) => [field.name, exampleInput(field)]));
	const required = writable.filter((field) => field.required);
	const created = fields.find((field) => field.type === 'created')?.name;
	const textField = readable.find((field) => field.type === 'text')?.name;
	const sort = created ? `-${created}` : undefined;
	const filter = textField ? `${textField} ~ "hello"` : undefined;

	const path = `/api/collections/${collection.name}/records`;
	const url = `${origin}${path}`;
	const sdk = `pb.collection('${collection.name}')`;
	const setup = `import { Pouchbase } from '@pouchbasejs/js-sdk';\n\nconst pb = new Pouchbase('${origin}');\n\n`;
	const auth = `-H "Authorization: Bearer $TOKEN"`;
	const listOptions = [
		filter && `\tfilter: '${filter.replace(/'/g, "\\'")}'`,
		sort && `\tsort: '${sort}'`
	].filter(Boolean);
	const listQuery = new URLSearchParams({ page: '1', perPage: '30' });

	if (sort) {
		listQuery.set('sort', sort);
	}

	if (filter) {
		listQuery.set('filter', filter);
	}

	const locked = {
		status: 403,
		description: 'The rule is locked.',
		body: json({ message: 'Only admins can do this: the API rule is locked' })
	};
	const notFound = {
		status: 404,
		description: "The record doesn't exist or the rule doesn't match it.",
		body: json({ message: 'Record not found' })
	};
	const invalid = {
		status: 400,
		description: 'Invalid values, with a message per field.',
		body: json({
			message: 'Invalid record',
			issues: { [required[0]?.name ?? writable[0]?.name ?? 'field']: 'Required' }
		})
	};
	const bodyParams = writable.map((field) => ({
		name: field.name,
		type: inputType(field, relationTargets),
		required: field.required,
		description: fieldValueType(field, relationTargets[field.name]).note ?? ''
	}));

	const examples: Record<ApiRuleAction, ApiExample> = {
		list: {
			action: 'list',
			description:
				'One page of records that match the filter and the list rule. Records the rule doesn’t match are left out.',
			method: 'GET',
			path,
			sdk: `${setup}// One page of records
const result = await ${sdk}.getList(1, 30${listOptions.length ? `, {\n${listOptions.join(',\n')}\n}` : ''});

// Every record, fetched page by page
const records = await ${sdk}.getFullList(${sort ? `{ sort: '${sort}' }` : ''});

// The first record that matches a filter, or null
const first = await ${sdk}.getFirstListItem(
	pb.filter('${textField ?? 'id'} = {:value}', { value: 'hello' })
);`,
			curl: `curl -G '${url}' \\\n\t${auth} \\\n\t${[...listQuery].map(([key, value]) => `--data-urlencode '${key}=${value.replace(/'/g, "'\\''")}'`).join(' \\\n\t')}`,
			queryParams: [
				{ name: 'page', type: 'number', description: 'The page, starting at 1. Defaults to 1.' },
				{
					name: 'perPage',
					type: 'number',
					description: 'Records per page, at most 500. Defaults to 30.'
				},
				{
					name: 'sort',
					type: 'string',
					description:
						'Fields to sort on, separated by commas; `-` in front sorts descending, e.g. `-created_at,title`. Defaults to the order of creation.'
				},
				{
					name: 'filter',
					type: 'string',
					description:
						'A filter in the syntax of the API rules, e.g. `status = "published" && views > 10`.'
				}
			],
			bodyParams: [],
			responses: [
				{
					status: 200,
					description: 'A page of records.',
					body: json({ page: 1, perPage: 30, totalItems: 1, totalPages: 1, items: [record] })
				},
				{
					status: 400,
					description: 'An invalid filter or sort.',
					body: json({ message: 'Invalid filter: Unknown field `foo`' })
				},
				locked
			]
		},
		view: {
			action: 'view',
			description: 'One record by id, when the view rule matches it.',
			method: 'GET',
			path: `${path}/:id`,
			sdk: `${setup}const record = await ${sdk}.getOne('RECORD_ID'); // null when not found`,
			curl: `curl '${url}/RECORD_ID' \\\n\t${auth}`,
			queryParams: [],
			bodyParams: [],
			responses: [{ status: 200, description: 'The record.', body: json(record) }, locked, notFound]
		},
		create: {
			action: 'create',
			description:
				'Creates a record when the create rule matches it. Fields that are left out get their default value; `id` and the timestamps are filled in.',
			method: 'POST',
			path,
			sdk: `${setup}const record = await ${sdk}.create(${objectLiteral(body, '')});`,
			curl: `curl -X POST '${url}' \\\n\t${auth} \\\n\t-H 'Content-Type: application/json' \\\n\t-d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`,
			queryParams: [],
			bodyParams,
			responses: [
				{ status: 200, description: 'The new record.', body: json(record) },
				invalid,
				{
					status: 403,
					description: 'The rule is locked or doesn’t match the new record.',
					body: json({ message: 'The create rule of this collection doesn’t allow this record' })
				},
				{
					status: 409,
					description: 'A unique field’s value is taken.',
					body: json({
						message: 'A record with this value already exists',
						issues: { [writable[0]?.name ?? 'field']: 'This value is already in use' }
					})
				}
			]
		},
		update: {
			action: 'update',
			description:
				'Changes the fields in the body of a record, when the update rule matches the stored record. Fields that are left out keep their value.',
			method: 'PATCH',
			path: `${path}/:id`,
			sdk: `${setup}const record = await ${sdk}.update('RECORD_ID', ${objectLiteral(body, '')});`,
			curl: `curl -X PATCH '${url}/RECORD_ID' \\\n\t${auth} \\\n\t-H 'Content-Type: application/json' \\\n\t-d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`,
			queryParams: [],
			bodyParams: bodyParams.map((param) => ({ ...param, required: false })),
			responses: [
				{ status: 200, description: 'The updated record.', body: json(record) },
				invalid,
				locked,
				notFound
			]
		},
		delete: {
			action: 'delete',
			description: 'Deletes a record when the delete rule matches it.',
			method: 'DELETE',
			path: `${path}/:id`,
			sdk: `${setup}await ${sdk}.delete('RECORD_ID');`,
			curl: `curl -X DELETE '${url}/RECORD_ID' \\\n\t${auth}`,
			queryParams: [],
			bodyParams: [],
			responses: [{ status: 204, description: 'Deleted; no body.', body: null }, locked, notFound]
		}
	};

	return apiActions(collection).map((action) => examples[action]);
}
