import type { ComputedTransform, FieldOptions, FieldType } from '#lib/fields/field-types.js';

import { computeValue, hasComputedSource } from '#lib/fields/field-types.js';

import { queryDatabase, queryObjects } from './db/query';
import { ScriptError, ScriptSandbox } from './scripts';

/**
 * Values of computed fields: from one source field with a built-in transform, or from a script
 * that gets the whole record (run in `./scripts`). Functions throw on errors; services wrap them.
 */

/** The parts of a field that computing needs. */
type FieldLike = { name: string; type: FieldType; options: FieldOptions };

/** A computed field and what it is calculated from. */
export type ComputedSpec = {
	name: string;
	transform: ComputedTransform;
	/** For the built-in transforms. */
	source?: { name: string; type: FieldType };
	/** For `script`. */
	script?: string;
};

/** A computed field whose script failed for a record; the message is for the form. */
export class ComputeError extends Error {
	override name = 'ComputeError';

	constructor(
		readonly field: string,
		message: string
	) {
		super(message);
	}
}

/** The computed fields of a collection, given all of its fields. */
export function computedSpecs(fields: FieldLike[]): ComputedSpec[] {
	return fields.flatMap((field): ComputedSpec[] => {
		const { transform, source: sourceName, script } = field.options;

		if (field.type !== 'computed' || !transform) {
			return [];
		}

		if (!hasComputedSource(transform)) {
			return [{ name: field.name, transform, script: script ?? '' }];
		}

		const source = fields.find((other) => other.name === sourceName);

		return source
			? [{ name: field.name, transform, source: { name: source.name, type: source.type } }]
			: [];
	});
}

/** What a script returned, as stored in the (TEXT) column. */
function toColumn(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	return JSON.stringify(value);
}

export type Computer = {
	/**
	 * Values of every computed field for a record. Throws a `ComputeError` when a script fails,
	 * unless `lenient`, which stores `null` for that field instead.
	 */
	compute(
		record: Record<string, unknown>,
		previous: Record<string, unknown> | null,
		options?: { lenient?: boolean }
	): Record<string, string | null>;
	dispose(): void;
};

/**
 * Prepares the computed fields of a collection. Scripts are compiled once, so create one computer
 * per batch of records and `dispose()` it. Throws a `ComputeError` when a script doesn't compile.
 */
export async function createComputer(collection: string, specs: ComputedSpec[]): Promise<Computer> {
	const scripts = specs.filter((spec) => spec.transform === 'script');
	const sandbox = scripts.length ? await ScriptSandbox.create() : null;

	try {
		for (const spec of scripts) {
			try {
				sandbox!.compile(spec.name, spec.script ?? '');
			} catch (error) {
				throw error instanceof ScriptError ? new ComputeError(spec.name, error.message) : error;
			}
		}
	} catch (error) {
		sandbox?.dispose();
		throw error;
	}

	return {
		compute(record, previous, options = {}) {
			const values: Record<string, string | null> = {};

			for (const spec of specs) {
				if (spec.source) {
					values[spec.name] = computeValue(
						spec.transform,
						spec.source.type,
						record[spec.source.name]
					);
					continue;
				}

				try {
					values[spec.name] = toColumn(
						sandbox!.call(spec.name, record, { collection, isNew: !previous, previous })
					);
				} catch (error) {
					if (!(error instanceof ScriptError)) {
						throw error;
					}

					if (!options.lenient) {
						throw new ComputeError(spec.name, error.message);
					}

					values[spec.name] = null;
				}
			}

			return values;
		},
		dispose() {
			sandbox?.dispose();
		}
	};
}

/** Rows read per query when filling a whole table. */
const PAGE_SIZE = 200;
/** Rows per UPDATE: 3 bound parameters each, within D1's limit of 100. */
const UPDATE_SIZE = 30;

/**
 * Recalculates computed fields for the given rows or, without `ids`, for every row of the table.
 * Used when a computed field is added or changed, and for rows inserted without the records
 * service (e.g. users created by a sign-up).
 *
 * Rows are found by their `rowid`, which every collection table has, also without an `id` field.
 *
 * @param columns Columns a script can read (blobs are left out, they can be large).
 * @param options.ids Values of the `key` column of the rows to recalculate.
 * @param options.key The column `ids` refer to: the `id` field, or `rowid` when there is none.
 * @param options.lenient Store `null` when a script fails instead of throwing a `ComputeError`.
 */
export async function fillComputedColumns(
	databaseId: string,
	table: string,
	columns: string[],
	specs: ComputedSpec[],
	options: { ids?: string[]; key?: string; lenient?: boolean } = {}
) {
	const { ids, key = 'rowid' } = options;

	if (!specs.length || ids?.length === 0) {
		return;
	}

	const computer = await createComputer(table, specs);
	// Field names can't start with `_`, so the alias never shadows a column.
	const select = `SELECT rowid AS "_rowid", ${columns.map((name) => `"${name}"`).join(', ')} FROM "${table}"`;

	try {
		for (let offset = 0; ; offset += PAGE_SIZE) {
			const batch = ids?.slice(offset, offset + PAGE_SIZE);

			if (ids && !batch?.length) {
				return;
			}

			const rows = batch
				? await queryObjects(
						databaseId,
						`${select} WHERE "${key}" IN (${batch.map(() => '?').join(', ')})`,
						batch
					)
				: await queryObjects(databaseId, `${select} ORDER BY rowid LIMIT ? OFFSET ?`, [
						PAGE_SIZE,
						offset
					]);

			const computed = rows.map(({ _rowid: rowid, ...row }) => {
				try {
					// The stored row stands in for "previous": the record isn't new.
					return [Number(rowid), computer.compute(row, row, options)] as const;
				} catch (error) {
					if (error instanceof ComputeError) {
						error.message = `Record ${String(row[key] ?? rowid)}: ${error.message}`;
					}

					throw error;
				}
			});

			for (const spec of specs) {
				for (let start = 0; start < computed.length; start += UPDATE_SIZE) {
					const chunk = computed.slice(start, start + UPDATE_SIZE);

					await queryDatabase(
						databaseId,
						`UPDATE "${table}" SET "${spec.name}" = CASE rowid ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE rowid IN (${chunk.map(() => '?').join(', ')})`,
						[
							...chunk.flatMap(([id, values]) => [id, values[spec.name]]),
							...chunk.map(([id]) => id)
						]
					);
				}
			}

			if (!ids && rows.length < PAGE_SIZE) {
				return;
			}
		}
	} finally {
		computer.dispose();
	}
}
