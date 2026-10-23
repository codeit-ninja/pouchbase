/**
 * Filter expressions, used by `?filter=` of the records API and by the API
 * rules of a collection:
 *
 * ```
 * status = "published" && (views > 10 || author = @request.auth.id)
 * ```
 *
 * - Operands: field names, `"strings"` or `'strings'`, numbers, `true`, `false`, `null`, `@now`,
 *   `@request.auth.<field>` (the signed-in user; `""` when signed out) and
 *   `@request.body.<field>` (the submitted value, for create and update rules).
 * - Operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `~` (contains / like), `!~` (doesn't contain), and
 *   the same prefixed with `?` (`?=`, `?~`, ...) for "any item of" a multiple relation or list.
 * - `&&`, `||` and parentheses; `//` starts a comment until the end of the line.
 *
 * Shared between the client (validating rules in forms) and the server, which compiles the parsed
 * expression to SQL (`src/lib/server/filter.ts`).
 */

export const COMPARE_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', '~', '!~'] as const;

export type CompareOperator = (typeof COMPARE_OPERATORS)[number];

export type Operand =
	// `position`: where the name starts in the text, for error messages in the editor.
	| { kind: 'field'; name: string; position: number }
	| { kind: 'auth'; name: string; position: number }
	| { kind: 'body'; name: string; position: number }
	| { kind: 'string'; value: string }
	| { kind: 'number'; value: number }
	| { kind: 'boolean'; value: boolean }
	| { kind: 'null' }
	| { kind: 'now' };

export type FilterExpression =
	| { kind: 'and' | 'or'; left: FilterExpression; right: FilterExpression }
	| {
			kind: 'compare';
			operator: CompareOperator;
			/** `?=`, `?~`, ...: true when any item of the left (multiple) value matches. */
			any: boolean;
			left: Operand;
			right: Operand;
	  };

/** Longest filter or rule, in characters. */
export const MAX_FILTER_LENGTH = 3500;
/** Most comparisons in one expression; keeps the SQL within D1's limit of bound parameters. */
export const MAX_COMPARISONS = 30;

const NAME = /^[a-z][a-z0-9_]{0,62}$/;

/** A filter that can't be parsed; `position` is the offset in the text where it went wrong. */
export class FilterError extends Error {
	override name = 'FilterError';
	readonly position: number;

	constructor(message: string, position = 0) {
		super(message);
		this.position = position;
	}
}

type Token =
	| { type: 'string'; value: string; position: number }
	| { type: 'number'; value: number; position: number }
	| { type: 'identifier'; value: string; position: number }
	| { type: 'operator'; value: CompareOperator; any: boolean; position: number }
	| { type: 'and' | 'or' | '(' | ')'; position: number };

function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;

	while (index < text.length) {
		const char = text[index];
		const position = index;

		if (/\s/.test(char)) {
			index++;
			continue;
		}

		if (text.startsWith('//', index)) {
			const end = text.indexOf('\n', index);
			index = end === -1 ? text.length : end;
			continue;
		}

		if (char === '(' || char === ')') {
			tokens.push({ type: char, position });
			index++;
			continue;
		}

		if (text.startsWith('&&', index) || text.startsWith('||', index)) {
			tokens.push({ type: char === '&' ? 'and' : 'or', position });
			index += 2;
			continue;
		}

		if (char === '"' || char === "'") {
			let value = '';

			index++;

			while (index < text.length && text[index] !== char) {
				if (text[index] === '\\' && index + 1 < text.length) {
					index++;
				}

				value += text[index];
				index++;
			}

			if (index >= text.length) {
				throw new FilterError('Unterminated string', position);
			}

			index++;
			tokens.push({ type: 'string', value, position });
			continue;
		}

		const number = /^-?\d+(\.\d+)?/.exec(text.slice(index));

		if (number) {
			tokens.push({ type: 'number', value: Number(number[0]), position });
			index += number[0].length;
			continue;
		}

		const operator = /^\??(!=|>=|<=|!~|=|>|<|~)/.exec(text.slice(index));

		if (operator) {
			const any = operator[0].startsWith('?');

			tokens.push({
				type: 'operator',
				value: (any ? operator[0].slice(1) : operator[0]) as CompareOperator,
				any,
				position
			});
			index += operator[0].length;
			continue;
		}

		const identifier = /^@?[A-Za-z_][A-Za-z0-9_.]*/.exec(text.slice(index));

		if (identifier) {
			tokens.push({ type: 'identifier', value: identifier[0], position });
			index += identifier[0].length;
			continue;
		}

		throw new FilterError(`Unexpected character \`${char}\``, position);
	}

	return tokens;
}

function identifierOperand(value: string, position: number): Operand {
	switch (value) {
		case 'true':
		case 'false':
			return { kind: 'boolean', value: value === 'true' };
		case 'null':
			return { kind: 'null' };
		case '@now':
			return { kind: 'now' };
	}

	const request = /^@request\.(auth|body)\.(.+)$/.exec(value);

	if (request) {
		if (!NAME.test(request[2])) {
			throw new FilterError(`\`${request[2]}\` is not a field name`, position);
		}

		return { kind: request[1] as 'auth' | 'body', name: request[2], position };
	}

	if (value.startsWith('@')) {
		throw new FilterError(
			`Unknown variable \`${value}\`; use @now, @request.auth.<field> or @request.body.<field>`,
			position
		);
	}

	if (value.includes('.')) {
		throw new FilterError(`Fields of related records (\`${value}\`) aren't supported`, position);
	}

	if (!NAME.test(value)) {
		throw new FilterError(`\`${value}\` is not a field name`, position);
	}

	return { kind: 'field', name: value, position };
}

/**
 * Parses a filter expression.
 * @throws {FilterError} When the text isn't a valid expression.
 */
export function parseFilter(text: string): FilterExpression {
	if (text.length > MAX_FILTER_LENGTH) {
		throw new FilterError(`Use at most ${MAX_FILTER_LENGTH} characters`);
	}

	const tokens = tokenize(text);
	let index = 0;
	let comparisons = 0;

	const peek = () => tokens[index];
	const end = () => (tokens.at(-1)?.position ?? 0) + 1;

	function operand(): Operand {
		const token = tokens[index++];

		if (!token) {
			throw new FilterError('Expected a value at the end', end());
		}

		switch (token.type) {
			case 'string':
				return { kind: 'string', value: token.value };
			case 'number':
				return { kind: 'number', value: token.value };
			case 'identifier':
				return identifierOperand(token.value, token.position);
			default:
				throw new FilterError('Expected a field or a value', token.position);
		}
	}

	function primary(): FilterExpression {
		const token = peek();

		if (token?.type === '(') {
			index++;

			const inner = or();

			if (peek()?.type !== ')') {
				throw new FilterError('Missing `)`', peek()?.position ?? end());
			}

			index++;
			return inner;
		}

		const left = operand();
		const operator = tokens[index++];

		if (operator?.type !== 'operator') {
			throw new FilterError(
				'Expected an operator such as =, !=, >, < or ~',
				operator?.position ?? end()
			);
		}

		if (++comparisons > MAX_COMPARISONS) {
			throw new FilterError(`Use at most ${MAX_COMPARISONS} comparisons`, operator.position);
		}

		return { kind: 'compare', operator: operator.value, any: operator.any, left, right: operand() };
	}

	function and(): FilterExpression {
		let left = primary();

		while (peek()?.type === 'and') {
			index++;
			left = { kind: 'and', left, right: primary() };
		}

		return left;
	}

	function or(): FilterExpression {
		let left = and();

		while (peek()?.type === 'or') {
			index++;
			left = { kind: 'or', left, right: and() };
		}

		return left;
	}

	if (!tokens.length) {
		throw new FilterError('The filter is empty');
	}

	const expression = or();
	const rest = peek();

	if (rest) {
		throw new FilterError('Expected && or || between conditions', rest.position);
	}

	return expression;
}

/** Names of the collection's fields an expression reads (not those of `@request.*`). */
export function filterFields(expression: FilterExpression): string[] {
	if (expression.kind !== 'compare') {
		return [...new Set([...filterFields(expression.left), ...filterFields(expression.right)])];
	}

	return [expression.left, expression.right].flatMap((operand) =>
		operand.kind === 'field' ? [operand.name] : []
	);
}

/** A problem in a filter, with the part of the text it is about (offsets, `end` exclusive). */
export type FilterProblem = { message: string; start: number; end: number };

/** The end of the word (name, number, string or operator) that starts at `start`. */
function wordEnd(text: string, start: number) {
	const match = /^(@?[\w.]+|"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|[^\s\w]+)/.exec(
		text.slice(start)
	);

	return start + Math.max(match?.[0].length ?? 1, 1);
}

/**
 * Checks a filter as the server will: its syntax, and that the fields it uses exist. Fields of the
 * signed-in user (`@request.auth.*`) are only checked when `authFields` is given. Returns the
 * first problem, or `null` when the filter is valid.
 */
export function checkFilter(
	text: string,
	names: { fields: string[]; authFields?: string[] }
): FilterProblem | null {
	let expression: FilterExpression;

	try {
		expression = parseFilter(text);
	} catch (error) {
		if (!(error instanceof FilterError)) {
			throw error;
		}

		const start = Math.min(error.position, Math.max(text.length - 1, 0));

		return { message: error.message, start, end: wordEnd(text, start) };
	}

	const operands = (node: FilterExpression): Operand[] =>
		node.kind === 'compare'
			? [node.left, node.right]
			: [...operands(node.left), ...operands(node.right)];

	for (const operand of operands(expression)) {
		if (operand.kind !== 'field' && operand.kind !== 'auth' && operand.kind !== 'body') {
			continue;
		}

		const known =
			operand.kind === 'auth'
				? !names.authFields || names.authFields.includes(operand.name)
				: names.fields.includes(operand.name);

		if (!known) {
			const owner = operand.kind === 'auth' ? 'users' : 'this collection';

			return {
				message: `\`${operand.name}\` is not a field of ${owner}`,
				start: operand.position,
				end: wordEnd(text, operand.position)
			};
		}
	}

	return null;
}
