import type { Completion } from '#lib/components/ui/inputs/code/index.js';

import { SQL_FUNCTIONS, SQL_KEYWORDS, SQL_TIME_STRINGS } from '#lib/fields/sql-expression.js';

/**
 * Autocomplete of the SQL expression editor for default values: exactly the functions and
 * keywords an expression may use, plus the time values and modifiers of the date functions
 * inside strings.
 */
export const SQL_COMPLETIONS: Completion[] = [
	...Object.entries(SQL_FUNCTIONS).map(([name, fn]): Completion => ({
		label: name,
		kind: 'function',
		detail: fn.signature,
		documentation: fn.description,
		insertText: fn.snippet ?? `${name}($0)`
	})),
	...Object.entries(SQL_KEYWORDS).map(([keyword, description]): Completion => ({
		label: keyword.toUpperCase(),
		kind: 'keyword',
		documentation: description
	})),
	...Object.entries(SQL_TIME_STRINGS).map(([value, description]): Completion => ({
		label: value,
		kind: 'value',
		documentation: description,
		inString: true
	}))
];
