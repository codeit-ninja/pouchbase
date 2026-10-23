import type { FieldType } from './field-types';

/**
 * Default values written as a SQLite expression, e.g. `datetime('now', '+7 days')`. They are
 * evaluated on the app database (D1) when a record is created; SQLite can't use them as a column
 * DEFAULT, because `ALTER TABLE ... ADD COLUMN` only accepts constant defaults.
 *
 * The expression ends up in SQL, so it is limited to literals, operators and the functions below:
 * no column references, subqueries, parameters, comments or multiple statements. Shared between
 * the add-field form and the server, which also evaluates it once to check it.
 */

/** Field types whose default value can be a SQL expression. */
export const SQL_DEFAULT_TYPES = new Set<FieldType>([
	'text',
	'rich_text',
	'number',
	'integer',
	'date',
	'email',
	'url',
	'json'
]);

/** Longest expression, in characters. */
export const MAX_SQL_EXPRESSION_LENGTH = 500;

export type SqlFunction = {
	/** How it is called, e.g. `datetime(time, ...modifiers)`. */
	signature: string;
	description: string;
	/** What autocomplete inserts, in snippet syntax; defaults to `name($0)`. */
	snippet?: string;
};

/**
 * SQLite and D1 functions an expression can call: scalar functions without side effects. Also
 * the suggestions of the expression editor.
 */
export const SQL_FUNCTIONS: Record<string, SqlFunction> = {
	// Date and time.
	datetime: {
		signature: 'datetime(time, ...modifiers)',
		description: "Date and time as `YYYY-MM-DD HH:MM:SS`, e.g. `datetime('now', '+7 days')`.",
		snippet: "datetime('${1:now}'$0)"
	},
	date: {
		signature: 'date(time, ...modifiers)',
		description: "Date as `YYYY-MM-DD`, e.g. `date('now', 'start of month')`.",
		snippet: "date('${1:now}'$0)"
	},
	time: {
		signature: 'time(time, ...modifiers)',
		description: 'Time as `HH:MM:SS`.',
		snippet: "time('${1:now}'$0)"
	},
	julianday: {
		signature: 'julianday(time, ...modifiers)',
		description: 'Days since noon in Greenwich on November 24, 4714 B.C., as a decimal number.',
		snippet: "julianday('${1:now}'$0)"
	},
	unixepoch: {
		signature: 'unixepoch(time, ...modifiers)',
		description: 'Seconds since 1970-01-01 00:00:00 UTC, as an integer.',
		snippet: "unixepoch('${1:now}'$0)"
	},
	strftime: {
		signature: 'strftime(format, time, ...modifiers)',
		description:
			"Formats a date, e.g. `strftime('%Y-%m', 'now')`. `%d` day, `%H` hour, `%M` minute.",
		snippet: "strftime('${1:%Y-%m-%d}', '${2:now}'$0)"
	},
	timediff: {
		signature: 'timediff(time1, time2)',
		description: 'The difference between two times, e.g. `+0001-02-03 04:05:06.000`.'
	},
	// Text and values.
	abs: { signature: 'abs(x)', description: 'The absolute value of a number.' },
	char: { signature: 'char(...codes)', description: 'Text made of these Unicode code points.' },
	coalesce: {
		signature: 'coalesce(x, y, ...)',
		description: 'The first argument that is not NULL.'
	},
	concat: { signature: 'concat(...values)', description: 'Joins the values as text; skips NULLs.' },
	concat_ws: {
		signature: 'concat_ws(separator, ...values)',
		description: "Joins the values with a separator, e.g. `concat_ws('-', 2026, 1)`."
	},
	format: {
		signature: 'format(format, ...values)',
		description: "Formats values like C's printf, e.g. `format('%05d', 42)`."
	},
	hex: { signature: 'hex(x)', description: 'Upper-case hexadecimal text of a value or blob.' },
	ifnull: { signature: 'ifnull(x, y)', description: 'x, or y when x is NULL.' },
	iif: {
		signature: 'iif(condition, then, else)',
		description: 'then when the condition is true, otherwise else.'
	},
	instr: {
		signature: 'instr(text, search)',
		description: 'Position of the first occurrence of search in text (1-based); 0 when absent.'
	},
	length: { signature: 'length(x)', description: 'Number of characters of text.' },
	lower: { signature: 'lower(text)', description: 'Text in lowercase.' },
	ltrim: { signature: 'ltrim(text, characters?)', description: 'Removes leading spaces.' },
	max: { signature: 'max(x, y, ...)', description: 'The largest of the arguments.' },
	min: { signature: 'min(x, y, ...)', description: 'The smallest of the arguments.' },
	nullif: { signature: 'nullif(x, y)', description: 'NULL when x equals y, otherwise x.' },
	printf: { signature: 'printf(format, ...values)', description: 'Same as `format`.' },
	quote: { signature: 'quote(x)', description: 'The value as a SQL literal.' },
	random: {
		signature: 'random()',
		description: 'A random 64-bit integer, e.g. `abs(random()) % 100` for 0–99.',
		snippet: 'random()'
	},
	randomblob: {
		signature: 'randomblob(n)',
		description: 'n random bytes; use `lower(hex(randomblob(8)))` for random text.'
	},
	replace: {
		signature: 'replace(text, search, replacement)',
		description: 'Replaces every occurrence of search.'
	},
	round: {
		signature: 'round(x, digits?)',
		description: 'Rounds to a number of decimals (0 by default).'
	},
	rtrim: { signature: 'rtrim(text, characters?)', description: 'Removes trailing spaces.' },
	sign: {
		signature: 'sign(x)',
		description: '-1, 0 or 1 for a negative, zero or positive number.'
	},
	substr: {
		signature: 'substr(text, start, length?)',
		description: 'Part of text, from start (1-based).'
	},
	substring: { signature: 'substring(text, start, length?)', description: 'Same as `substr`.' },
	trim: {
		signature: 'trim(text, characters?)',
		description: 'Removes leading and trailing spaces.'
	},
	typeof: {
		signature: 'typeof(x)',
		description: "The type of a value: 'null', 'integer', 'real', 'text' or 'blob'."
	},
	unhex: { signature: 'unhex(text)', description: 'The blob of hexadecimal text.' },
	unicode: { signature: 'unicode(text)', description: 'Code point of the first character.' },
	upper: { signature: 'upper(text)', description: 'Text in uppercase.' },
	// Math.
	acos: { signature: 'acos(x)', description: 'Arccosine, in radians.' },
	asin: { signature: 'asin(x)', description: 'Arcsine, in radians.' },
	atan: { signature: 'atan(x)', description: 'Arctangent, in radians.' },
	atan2: { signature: 'atan2(y, x)', description: 'Arctangent of y/x, in radians.' },
	ceil: { signature: 'ceil(x)', description: 'Rounds up to a whole number.' },
	ceiling: { signature: 'ceiling(x)', description: 'Same as `ceil`.' },
	cos: { signature: 'cos(x)', description: 'Cosine of an angle in radians.' },
	degrees: { signature: 'degrees(x)', description: 'Radians to degrees.' },
	exp: { signature: 'exp(x)', description: 'e to the power of x.' },
	floor: { signature: 'floor(x)', description: 'Rounds down to a whole number.' },
	ln: { signature: 'ln(x)', description: 'Natural logarithm.' },
	log: { signature: 'log(x) / log(base, x)', description: 'Base-10 logarithm, or of a base.' },
	log10: { signature: 'log10(x)', description: 'Base-10 logarithm.' },
	log2: { signature: 'log2(x)', description: 'Base-2 logarithm.' },
	mod: { signature: 'mod(x, y)', description: 'Remainder of x divided by y.' },
	pi: { signature: 'pi()', description: 'π, about 3.14159.', snippet: 'pi()' },
	pow: { signature: 'pow(x, y)', description: 'x to the power of y.' },
	power: { signature: 'power(x, y)', description: 'Same as `pow`.' },
	radians: { signature: 'radians(x)', description: 'Degrees to radians.' },
	sin: { signature: 'sin(x)', description: 'Sine of an angle in radians.' },
	sqrt: { signature: 'sqrt(x)', description: 'Square root.' },
	tan: { signature: 'tan(x)', description: 'Tangent of an angle in radians.' },
	trunc: { signature: 'trunc(x)', description: 'Drops the decimals.' },
	// JSON.
	json: { signature: 'json(text)', description: 'Minified JSON; fails on invalid JSON.' },
	json_array: {
		signature: 'json_array(...values)',
		description: 'A JSON array, e.g. `json_array(1, 2)`.'
	},
	json_object: {
		signature: 'json_object(key, value, ...)',
		description: "A JSON object, e.g. `json_object('created', datetime('now'))`."
	},
	json_quote: { signature: 'json_quote(x)', description: 'A value as JSON, e.g. text in quotes.' }
};

/** Keywords an expression can use (outside function calls), with a description for suggestions. */
export const SQL_KEYWORDS: Record<string, string> = {
	null: 'No value.',
	true: '1.',
	false: '0.',
	current_date: 'Today as `YYYY-MM-DD`, in UTC.',
	current_time: 'The time as `HH:MM:SS`, in UTC.',
	current_timestamp: 'Date and time as `YYYY-MM-DD HH:MM:SS`, in UTC.',
	case: 'CASE WHEN condition THEN value ELSE value END.',
	when: 'Part of CASE.',
	then: 'Part of CASE.',
	else: 'Part of CASE.',
	end: 'Ends a CASE.',
	and: 'Both conditions are true.',
	or: 'One of the conditions is true.',
	not: 'Negates a condition.',
	is: 'Compares, also with NULL, e.g. `x IS NULL`.'
};

/**
 * Time values and modifiers of the date and time functions, suggested inside a string, e.g.
 * `datetime('now', '+7 days')`.
 */
export const SQL_TIME_STRINGS: Record<string, string> = {
	now: 'The current date and time, in UTC.',
	'+1 days': 'Adds days; also hours, minutes, seconds, months and years.',
	'-1 days': 'Subtracts days; also hours, minutes, seconds, months and years.',
	'+1 hours': 'Adds hours.',
	'+1 months': 'Adds months.',
	'+1 years': 'Adds years.',
	'start of day': 'Midnight of the same day.',
	'start of month': 'The first day of the month.',
	'start of year': 'January 1 of the year.',
	'weekday 1': 'The next Monday (0 is Sunday), or the same day when it already is one.',
	unixepoch: "Reads a number as seconds since 1970, e.g. `datetime(1767225600, 'unixepoch')`.",
	subsec: 'Keeps milliseconds.'
};

const TOKEN =
	/\s+|'(?:[^']|'')*'|\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+|[a-z_][a-z0-9_]*|\|\||<=|>=|<>|!=|==|[-+*/%(),<>=&|~]/giy;

/**
 * Checks an expression against the allowed syntax.
 *
 * @returns An error message, or `null` when the expression is allowed.
 */
export function checkSqlExpression(expression: string): string | null {
	const source = expression.trim();

	if (!source) {
		return 'Enter an expression';
	}

	if (source.length > MAX_SQL_EXPRESSION_LENGTH) {
		return `Expressions can be at most ${MAX_SQL_EXPRESSION_LENGTH} characters`;
	}

	// Comments could hide the rest of the statement the expression is placed in.
	if (/--|\/\*/.test(source.replace(/'(?:[^']|'')*'/g, "''"))) {
		return 'Comments are not allowed';
	}

	const tokens: string[] = [];

	TOKEN.lastIndex = 0;

	while (TOKEN.lastIndex < source.length) {
		const start = TOKEN.lastIndex;
		const match = TOKEN.exec(source);

		if (!match) {
			return `Not allowed here: ${source.slice(start, start + 10)}`;
		}

		if (match[0].trim()) {
			tokens.push(match[0]);
		}
	}

	let depth = 0;

	for (const [index, token] of tokens.entries()) {
		if (token === '(') {
			depth++;
		} else if (token === ')' && --depth < 0) {
			return 'Unbalanced parentheses';
		}

		if (!/^[a-z_]/i.test(token)) {
			continue;
		}

		const name = token.toLowerCase();

		if (tokens[index + 1] === '(') {
			if (!Object.hasOwn(SQL_FUNCTIONS, name)) {
				return `Unknown or unsupported function: ${token}`;
			}
		} else if (!Object.hasOwn(SQL_KEYWORDS, name)) {
			return `Not allowed here: ${token}`;
		}
	}

	return depth === 0 ? null : 'Unbalanced parentheses';
}

/**
 * The SQL that evaluates a default expression for a field. Date fields store ISO 8601 text in
 * UTC, so their expression is read as a SQLite time value (e.g. `datetime('now')` or
 * `date('now', '+1 day')`) and formatted that way.
 */
export function sqlDefaultSelect(type: FieldType, expression: string) {
	return type === 'date' ? `strftime('%Y-%m-%dT%H:%M:%fZ', (${expression}))` : `(${expression})`;
}
