import type { FilterExpression, Operand } from '#lib/filter/filter.js';
import type { Field } from './services/fields.service';

import { FilterError, parseFilter } from '#lib/filter/filter.js';

/**
 * Compiles filter expressions (`#lib/filter/filter.ts`) to a SQL condition with bound parameters,
 * for `?filter=` and the API rules of the records API. Throws a `FilterError` for unknown fields.
 *
 * Field names are checked against the collection's fields before they end up in the SQL, and
 * every value is a bound parameter, so a filter can never inject SQL.
 */

export type SqlCondition = { sql: string; params: (string | number | null)[] };

/** What `@request.*` refers to while the condition runs. */
export type FilterContext = {
	/** The signed-in user (a row of `users`), or `null`; every `@request.auth.*` is `""` then. */
	auth: Record<string, unknown> | null;
	/** The submitted fields, for create and update rules. */
	body?: Record<string, unknown>;
};

type CompiledOperand = SqlCondition & {
	field?: Pick<Field, 'name' | 'type'>;
	/** The literal `""` or `null`. */
	empty?: boolean;
};

/** The same condition for every record. */
export const ALWAYS: SqlCondition = { sql: '1', params: [] };

/** A value from the request as a bound parameter: booleans as `1`/`0`, objects as JSON. */
function bindable(value: unknown): string | number | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value === 'boolean') {
		return value ? 1 : 0;
	}

	if (typeof value === 'number' || typeof value === 'string') {
		return value;
	}

	return JSON.stringify(value);
}

function compileOperand(
	operand: Operand,
	fields: Map<string, Pick<Field, 'name' | 'type'>>,
	context: FilterContext,
	other: Operand
): CompiledOperand {
	switch (operand.kind) {
		case 'field': {
			const field = fields.get(operand.name);

			if (!field || field.type === 'blob') {
				throw new FilterError(`Unknown field \`${operand.name}\``);
			}

			return { sql: `"${field.name}"`, params: [], field };
		}
		case 'auth': {
			// Never `empty`: a signed-out user must not match records with an empty field.
			return { sql: '?', params: [context.auth ? bindable(context.auth[operand.name]) : ''] };
		}
		case 'body':
			return { sql: '?', params: [bindable(context.body?.[operand.name])] };
		case 'string':
			return { sql: '?', params: [operand.value], empty: operand.value === '' };
		case 'number':
			return { sql: '?', params: [operand.value] };
		case 'boolean':
			return { sql: operand.value ? '1' : '0', params: [] };
		case 'null':
			return { sql: 'NULL', params: [], empty: true };
		case 'now': {
			// `created` and `updated` fields hold milliseconds; dates are ISO 8601 text.
			const type = other.kind === 'field' ? fields.get(other.name)?.type : undefined;
			const now = new Date();

			return {
				sql: '?',
				params: [type === 'created' || type === 'updated' ? now.getTime() : now.toISOString()]
			};
		}
	}
}

/** A `LIKE` pattern: a literal string without `%` matches anywhere in the value. */
function likePattern(right: Operand, compiled: CompiledOperand): CompiledOperand {
	if (right.kind === 'string' && !right.value.includes('%')) {
		return { sql: '?', params: [`%${right.value}%`] };
	}

	if (right.kind === 'string') {
		return compiled;
	}

	return { sql: `'%' || ${compiled.sql} || '%'`, params: compiled.params };
}

function compare(
	operator: string,
	left: CompiledOperand,
	right: CompiledOperand,
	rightOperand: Operand
): SqlCondition {
	const params = [...left.params, ...right.params];

	switch (operator) {
		case '=':
		case '!=': {
			// `""` and `null` both match an empty value.
			const sql = right.empty
				? `COALESCE(${left.sql}, '') = ''`
				: left.empty
					? `COALESCE(${right.sql}, '') = ''`
					: `${left.sql} IS ${right.sql}`;
			const used = right.empty ? left.params : left.empty ? right.params : params;

			return { sql: operator === '=' ? sql : `NOT (${sql})`, params: used };
		}
		case '~':
		case '!~': {
			const pattern = likePattern(rightOperand, right);
			const sql = `COALESCE(${left.sql}, '') LIKE ${pattern.sql}`;

			return {
				sql: operator === '~' ? sql : `NOT (${sql})`,
				params: [...left.params, ...pattern.params]
			};
		}
		default:
			return { sql: `${left.sql} ${operator} ${right.sql}`, params };
	}
}

function compileExpression(
	expression: FilterExpression,
	fields: Map<string, Pick<Field, 'name' | 'type'>>,
	context: FilterContext
): SqlCondition {
	if (expression.kind !== 'compare') {
		const left = compileExpression(expression.left, fields, context);
		const right = compileExpression(expression.right, fields, context);

		return {
			sql: `(${left.sql} ${expression.kind === 'and' ? 'AND' : 'OR'} ${right.sql})`,
			params: [...left.params, ...right.params]
		};
	}

	const { operator, any, left: leftOperand, right: rightOperand } = expression;
	const left = compileOperand(leftOperand, fields, context, rightOperand);
	const right = compileOperand(rightOperand, fields, context, leftOperand);

	if (!any) {
		return compare(operator, left, right, rightOperand);
	}

	if (!left.field) {
		throw new FilterError(`\`?${operator}\` needs a field on the left`);
	}

	// Any item of a JSON array (multiple relations and lists); a single value counts as one item.
	const items = `CASE WHEN json_valid(${left.sql}) AND json_type(${left.sql}) = 'array' THEN ${left.sql} ELSE json_array(${left.sql}) END`;
	const condition = compare(operator, { sql: '"value"', params: [] }, right, rightOperand);

	return {
		sql: `EXISTS (SELECT 1 FROM json_each(${items}) WHERE ${condition.sql})`,
		params: condition.params
	};
}

/**
 * Compiles a filter expression for a collection with these fields.
 * @throws {FilterError} When the text isn't valid or refers to a field that doesn't exist.
 */
export function compileFilter(
	text: string,
	fields: Pick<Field, 'name' | 'type'>[],
	context: FilterContext
): SqlCondition {
	return compileExpression(
		parseFilter(text),
		new Map(fields.map((field) => [field.name, field])),
		context
	);
}

/**
 * The SQL condition of an API rule: `null` when the rule is locked, `ALWAYS` when it is empty.
 * @throws {FilterError} When the rule is invalid, e.g. after a field it uses was renamed.
 */
export function compileRule(
	rule: string | null | undefined,
	fields: Pick<Field, 'name' | 'type'>[],
	context: FilterContext
): SqlCondition | null {
	if (rule === null || rule === undefined) {
		return null;
	}

	return rule.trim() ? compileFilter(rule, fields, context) : ALWAYS;
}

/** Both conditions. */
export function both(first: SqlCondition, second: SqlCondition): SqlCondition {
	if (first === ALWAYS) {
		return second;
	}

	if (second === ALWAYS) {
		return first;
	}

	return { sql: `(${first.sql}) AND (${second.sql})`, params: [...first.params, ...second.params] };
}

/**
 * An `ORDER BY` list from `?sort=`: field names separated by commas, `-` in
 * front for descending (`-created_at,title`).
 * @throws {FilterError} For fields that don't exist or can't be sorted on.
 */
export function compileSort(text: string, fields: Pick<Field, 'name' | 'type'>[]): string[] {
	return text
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const descending = part.startsWith('-');
			const name = part.replace(/^[-+]/, '');
			const field = fields.find((candidate) => candidate.name === name);

			if (!field || field.type === 'blob') {
				throw new FilterError(`Can't sort on \`${name}\``);
			}

			return `"${field.name}" ${descending ? 'DESC' : 'ASC'}`;
		});
}
