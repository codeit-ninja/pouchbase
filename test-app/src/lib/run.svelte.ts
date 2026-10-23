import { filter, isPouchbaseError } from '@pouchbasejs/js-sdk';
import type { Filter } from '@pouchbasejs/js-sdk';

/** The outcome of the last call of a `Runner`, shown by `<Output>`. */
export type Outcome =
	{ ok: true; value: unknown; ms: number } | { ok: false; error: unknown; ms: number };

/** Runs SDK calls one at a time and keeps the last outcome and timing as state. */
export class Runner {
	outcome = $state<Outcome | null>(null);
	loading = $state(false);

	/** Runs `call`, records how it went and returns its value (or `undefined` when it threw). */
	async run<T>(call: () => Promise<T>): Promise<T | undefined> {
		const start = performance.now();

		this.loading = true;

		try {
			const value = await call();

			this.outcome = { ok: true, value, ms: performance.now() - start };

			return value;
		} catch (error) {
			this.outcome = { ok: false, error, ms: performance.now() - start };
		} finally {
			this.loading = false;
		}
	}
}

/** A plain object for an error, with the fields of a `PouchbaseError`. */
export function describeError(error: unknown) {
	if (isPouchbaseError(error)) {
		return {
			name: error.name,
			kind: error.kind,
			status: error.status,
			message: error.message,
			issues: error.issues,
			code: error.code,
			data: error.data
		};
	}

	return error instanceof Error ? { name: error.name, message: error.message } : error;
}

/** Parses a JSON text field; an empty field is `undefined`. */
export function parseJson(text: string): unknown {
	return text.trim() === '' ? undefined : JSON.parse(text);
}

/** A hand-written filter expression as a `Filter`, without escaping (this is a test tool). */
export function rawFilter(expression: string): Filter {
	return filter(Object.assign([expression], { raw: [expression] }));
}
