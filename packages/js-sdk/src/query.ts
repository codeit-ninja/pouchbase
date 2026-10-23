/**
 * Typed queries for `pb.db`: `where` objects, `orderBy` and `select`, compiled to the query string
 * of the records API (`filter`, `sort`, `fields`). Values are always escaped, so a value from a
 * user can never change the query.
 */

/** A value of a JSON field. */
export type JsonValue =
	string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const FILTER: unique symbol = Symbol('pouchbase.filter');

/** A filter written by hand with `filter\`…\``; its values are escaped. */
export type Filter = { readonly [FILTER]: string };

/** Values that can be put in a filter. */
export type FilterValue = string | number | boolean | null | undefined | Date;

/** The item type of an array field. */
type ItemOf<V> = V extends readonly (infer I)[] ? I : never;

/** Comparisons for every field. */
type Equality<V> = {
	/** Equal to the value. `null` (or `''`) matches empty fields. */
	eq?: V | null;
	/** Not equal to the value. `null` matches fields that are not empty. */
	not?: V | null;
	/** Equal to one of the values. */
	in?: readonly V[];
	/** Equal to none of the values. */
	notIn?: readonly V[];
};

/** Comparisons for fields that can be ordered: numbers, text and dates. */
type Ordering<V> = {
	gt?: V;
	gte?: V;
	lt?: V;
	lte?: V;
};

/** Text search, case-insensitive. A `%` in the value is a wildcard. */
type TextSearch = {
	/** Contains the text. */
	contains?: string;
	/** Doesn't contain the text. */
	notContains?: string;
};

/** Conditions for multiple relations, files and lists (arrays). */
type ArrayConditions<I> = {
	/** One of the items equals the value. */
	has?: I;
	/** Has no items (`true`) or at least one (`false`). */
	isEmpty?: boolean;
};

/** What a field can be compared with, depending on its type. */
export type FieldCondition<V> = [NonNullable<V>] extends [readonly unknown[]]
	? ArrayConditions<ItemOf<NonNullable<V>>>
	: [NonNullable<V>] extends [boolean]
		? NonNullable<V> | null | Equality<NonNullable<V>>
		: [NonNullable<V>] extends [number]
			? NonNullable<V> | null | (Equality<NonNullable<V>> & Ordering<NonNullable<V>>)
			: [NonNullable<V>] extends [string]
				? | NonNullable<V>
					| null
					| (Equality<NonNullable<V>> & Ordering<NonNullable<V> | Date> & TextSearch)
				: Equality<NonNullable<V>>;

/**
 * Which records to match, typed by the record: a value per field means "equals", an object holds
 * comparisons (`{ views: { gt: 10 } }`), and `$or` / `$and` combine conditions. Fields next to
 * each other must all match.
 *
 * ```ts
 * { status: 'published', views: { gte: 10 }, $or: [{ author: userId }, { featured: true }] }
 * ```
 */
export type Where<R> = {
	[K in keyof R]?: FieldCondition<R[K]>;
} & {
	/** At least one of these must match. */
	$or?: readonly Where<R>[];
	/** All of these must match. */
	$and?: readonly Where<R>[];
};

/** The sort order: fields in order of importance, each ascending or descending. */
export type OrderBy<R> = { [K in keyof R]?: 'asc' | 'desc' };

/** Field names of a record. */
export type FieldName<R> = keyof R & string;

/** The record with only the selected fields; the whole record without a selection. */
export type Selected<R, S> = S extends readonly FieldName<R>[] ? Pick<R, S[number]> : R;

const NAME = /^[a-z][a-z0-9_]{0,62}$/;

/** A value as a literal of the filter syntax. */
function literal(value: FilterValue): string {
	if (value === null || value === undefined) {
		return 'null';
	}

	if (value instanceof Date) {
		return literal(value.toISOString());
	}

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError(`Can't filter on ${value}`);
		}

		return String(value);
	}

	if (typeof value === 'boolean') {
		return String(value);
	}

	if (typeof value === 'string') {
		return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}

	throw new TypeError(`Can't filter on a value of type ${typeof value}`);
}

function fieldName(name: string) {
	if (!NAME.test(name)) {
		throw new TypeError(`\`${name}\` is not a field name`);
	}

	return name;
}

/**
 * A filter written by hand, for what `where` can't express, such as `@request.auth.id`. Values
 * in `${…}` are escaped, so they can come from users.
 *
 * ```ts
 * pb.db.posts.findMany({ where: filter`author = @request.auth.id || title ~ ${search}` });
 * ```
 */
export function filter(strings: TemplateStringsArray, ...values: FilterValue[]): Filter {
	return {
		[FILTER]: strings.reduce(
			(text, part, index) => text + part + (index < values.length ? literal(values[index]) : ''),
			''
		)
	};
}

function isFilter(value: unknown): value is Filter {
	return !!value && typeof value === 'object' && FILTER in value;
}

function isConditions(value: unknown) {
	return (
		!!value &&
		typeof value === 'object' &&
		!(value instanceof Date) &&
		!Array.isArray(value) &&
		!isFilter(value)
	);
}

const OPERATORS: Record<string, string> = {
	eq: '=',
	not: '!=',
	gt: '>',
	gte: '>=',
	lt: '<',
	lte: '<=',
	contains: '~',
	notContains: '!~'
};

/** One field's conditions as filter parts. */
function fieldParts(name: string, condition: unknown): string[] {
	if (condition === undefined) {
		return [];
	}

	if (!isConditions(condition)) {
		return [`${name} = ${literal(condition as FilterValue)}`];
	}

	return Object.entries(condition as Record<string, unknown>).flatMap(([operator, value]) => {
		if (value === undefined) {
			return [];
		}

		const values = value as FilterValue[];

		switch (operator) {
			case 'in':
				// Nothing to match: no record matches.
				return [
					values.length
						? `(${values.map((item) => `${name} = ${literal(item)}`).join(' || ')})`
						: '1 = 0'
				];
			case 'notIn':
				return values.map((item) => `${name} != ${literal(item)}`);
			case 'has':
				return [`${name} ?= ${literal(value as FilterValue)}`];
			case 'isEmpty':
				return [`${name} ${value ? '=' : '!='} ""`];
			default: {
				const symbol = OPERATORS[operator];

				if (!symbol) {
					throw new TypeError(`Unknown condition \`${operator}\` for \`${name}\``);
				}

				return [`${name} ${symbol} ${literal(value as FilterValue)}`];
			}
		}
	});
}

/** A `where` object as a filter expression; `''` when it matches every record. */
export function compileWhere(where: object | undefined): string {
	if (!where) {
		return '';
	}

	if (isFilter(where)) {
		return where[FILTER];
	}

	const parts = Object.entries(where).flatMap(([key, condition]): string[] => {
		if (key === '$or' || key === '$and') {
			const branches = (condition as object[] | undefined) ?? [];
			const compiled = branches.map((branch) => compileWhere(branch));

			// An empty `$or` matches nothing, an empty branch everything.
			if (key === '$or' && (!compiled.length || compiled.some((part) => !part))) {
				return compiled.length ? [] : ['1 = 0'];
			}

			const filled = compiled.filter(Boolean);

			return filled.length ? [`(${filled.join(key === '$or' ? ' || ' : ' && ')})`] : [];
		}

		return fieldParts(fieldName(key), condition);
	});

	return parts.join(' && ');
}

/** An `orderBy` object as `sort` (`-created_at,title`). */
export function compileOrderBy(orderBy: Record<string, string | undefined> | undefined): string {
	return Object.entries(orderBy ?? {})
		.filter(([, direction]) => direction)
		.map(([name, direction]) => `${direction === 'desc' ? '-' : ''}${fieldName(name)}`)
		.join(',');
}

/** A `select` list as `fields` (`id,title`). */
export function compileSelect(select: readonly string[] | undefined): string | undefined {
	return select?.length ? select.map(fieldName).join(',') : undefined;
}

/** What `include` holds per relation: `true`, or the relations of its records to include too. */
type IncludeTree = { [field: string]: true | { include?: IncludeTree } | undefined };

/** An `include` object as `expand` (`author,comments.author`). */
export function compileInclude(include: IncludeTree | undefined): string | undefined {
	const paths = (tree: IncludeTree, prefix: string): string[] =>
		Object.entries(tree).flatMap(([name, option]) => {
			if (!option) {
				return [];
			}

			const path = `${prefix}${fieldName(name)}`;
			const nested = option === true || !option.include ? [] : paths(option.include, `${path}.`);

			return nested.length ? nested : [path];
		});

	const expand = paths(include ?? {}, '');

	return expand.length ? expand.join(',') : undefined;
}
