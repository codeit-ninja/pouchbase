import type { RealtimeAction } from '#lib/realtime/protocol.js';
import type { SqlCondition } from '../filter';
import type { Field } from '../services/fields.service';
import type { AccessContext } from './hub-core';

import { filterFields, parseFilter } from '#lib/filter/filter.js';

import { ALWAYS, both, compileFilter, compileRule } from '../filter';

/**
 * Who may see a realtime event: the collection's view rule and the subscription's filter, checked
 * once per access context (a subject with a filter). The condition runs on the event's own values,
 * as a row made of bound parameters, the way the create rule runs on a new record. So a deleted
 * record is checked as it was, and a later write can't change the outcome.
 */

export type Statement = { sql: string; params: (string | number | null)[] };

/** Per context: allowed or denied right away, or a statement that returns a row when allowed. */
export type AuthorizeCheck = { key: string } & (
	{ allowed: boolean; statement?: undefined } | { statement: Statement; allowed?: undefined }
);

/** D1 allows at most 100 bound parameters per statement. */
const MAX_PARAMS = 95;

type Readable = Pick<Field, 'name' | 'type'>;

function bindable(value: unknown): string | number | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value === 'number' || typeof value === 'string') {
		return value;
	}

	if (typeof value === 'boolean') {
		return value ? 1 : 0;
	}

	return JSON.stringify(value);
}

/** The fields an expression reads, or none when it doesn't parse (compiling reports that). */
function referenced(text: string | null | undefined) {
	try {
		return text?.trim() ? filterFields(parseFilter(text)) : [];
	} catch {
		return [];
	}
}

/**
 * The checks for one event of a collection.
 *
 * @param options.viewRule - The collection's view rule (`null` or missing: locked).
 * @param options.viewOffered - Whether the records API offers `view` for the collection.
 * @param options.readable - The fields the API reads (all but blobs).
 * @param options.row - The event's stored values, by field name.
 * @param options.table / options.key / options.keyParam - For the fallback on the table, when the
 *   condition needs more parameters than a statement may have.
 */
export function authorizationChecks(options: {
	action: RealtimeAction;
	viewRule: string | null | undefined;
	viewOffered: boolean;
	readable: Readable[];
	row: Record<string, unknown>;
	table: string;
	key: string;
	keyParam: string | number;
	contexts: AccessContext[];
}): AuthorizeCheck[] {
	const { readable, row, contexts } = options;

	return contexts.map(({ key, subject, filter }): AuthorizeCheck => {
		const auth = subject.kind === 'user' ? subject.auth : null;
		let condition: SqlCondition | null;

		try {
			const rule =
				subject.kind === 'admin'
					? ALWAYS
					: options.viewOffered
						? compileRule(options.viewRule, readable, { auth })
						: null;

			condition = rule && filter ? both(rule, compileFilter(filter, readable, { auth })) : rule;
		} catch {
			// A rule or filter that no longer compiles (a field was renamed) lets nothing through.
			return { key, allowed: false };
		}

		if (!condition) {
			return { key, allowed: false };
		}

		if (condition === ALWAYS) {
			return { key, allowed: true };
		}

		const names = new Set([
			...(subject.kind === 'admin' ? [] : referenced(options.viewRule)),
			...referenced(filter)
		]);
		const columns = readable.filter((field) => names.has(field.name));

		if (columns.length + condition.params.length <= MAX_PARAMS) {
			const values = columns.length
				? columns.map((field) => `? AS "${field.name}"`).join(', ')
				: `1 AS "_"`;

			return {
				key,
				statement: {
					sql: `SELECT 1 FROM (SELECT ${values}) WHERE ${condition.sql}`,
					params: [...columns.map((field) => bindable(row[field.name])), ...condition.params]
				}
			};
		}

		// Too many parameters for a row of values: check the stored record instead. A deleted
		// record is gone, so its event isn't sent.
		if (options.action === 'delete' || condition.params.length + 1 > MAX_PARAMS) {
			return { key, allowed: false };
		}

		return {
			key,
			statement: {
				sql: `SELECT 1 FROM "${options.table}" WHERE "${options.key}" = ? AND (${condition.sql})`,
				params: [options.keyParam, ...condition.params]
			}
		};
	});
}
