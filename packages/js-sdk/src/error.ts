/**
 * What went wrong, from the HTTP status:
 *
 * - `network`: no response (offline, CORS, DNS).
 * - `invalid` (400): invalid input; `issues` has a message per field.
 * - `unauthorized` (401): missing, invalid or expired token.
 * - `forbidden` (403): not allowed, e.g. by a locked API rule.
 * - `not_found` (404): doesn't exist, or an API rule hides it.
 * - `conflict` (409): a unique value is taken; `issues` names the field.
 * - `server` (5xx), or `unknown` for anything else.
 */
export type ErrorKind =
	| 'network'
	| 'invalid'
	| 'unauthorized'
	| 'forbidden'
	| 'not_found'
	| 'conflict'
	| 'server'
	| 'unknown';

const KINDS: Record<number, ErrorKind> = {
	0: 'network',
	400: 'invalid',
	401: 'unauthorized',
	403: 'forbidden',
	404: 'not_found',
	409: 'conflict'
};

/**
 * Thrown for every failed request: a non-2xx response, a network error or an unreadable body.
 * `F` names the fields `issues` can be about, e.g. the fields of a record being saved.
 */
export class PouchbaseError<F extends string = string> extends Error {
	override name = 'PouchbaseError';
	/** HTTP status, or `0` when no response was received. */
	readonly status: number;
	/** What went wrong, from the status; see `ErrorKind`. */
	readonly kind: ErrorKind;
	/** Machine-readable reason where the API gives one, such as `email_in_use` for OAuth sign-ins. */
	readonly code: string;
	/** Validation messages per input field, for `invalid` and `conflict` errors. */
	readonly issues: Partial<Record<F, string>>;
	/** The parsed response body, if any. */
	readonly data: unknown;

	constructor(
		message: string,
		options: {
			status?: number;
			code?: string;
			issues?: Partial<Record<F, string>>;
			data?: unknown;
			cause?: unknown;
		} = {}
	) {
		super(message, { cause: options.cause });
		this.status = options.status ?? 0;
		this.kind = KINDS[this.status] ?? (this.status >= 500 ? 'server' : 'unknown');
		this.code = options.code ?? '';
		this.issues = options.issues ?? {};
		this.data = options.data;
	}
}

/**
 * Whether `error` is a `PouchbaseError`, optionally of one `kind`:
 *
 * ```ts
 * catch (error) {
 * 	if (isPouchbaseError(error, 'not_found')) { … }
 * }
 * ```
 */
export function isPouchbaseError<F extends string = string>(
	error: unknown,
	kind?: ErrorKind
): error is PouchbaseError<F> {
	return error instanceof PouchbaseError && (!kind || error.kind === kind);
}

/** The outcome of `.safe()`: the data, or the error instead of a thrown one. */
export type Result<T, F extends string = string> =
	{ ok: true; data: T; error: null } | { ok: false; data: null; error: PouchbaseError<F> };

/**
 * A request: await it for the data (it throws a `PouchbaseError` on failure), or call `.safe()` for
 * a `Result` that never throws, handy in forms:
 *
 * ```ts
 * const result = await pb.db.posts.insert(values).safe();
 *
 * if (!result.ok) {
 * 	showErrors(result.error.issues); // { title?: string; … }
 * }
 * ```
 */
export type Pending<T, F extends string = string> = Promise<T> & {
	safe(): Promise<Result<T, F>>;
};

/** Adds `.safe()` to a request's promise. */
export function pending<T, F extends string = string>(promise: Promise<T>): Pending<T, F> {
	return Object.assign(promise, {
		safe: () =>
			promise.then(
				(data): Result<T, F> => ({ ok: true, data, error: null }),
				(error: unknown): Result<T, F> => {
					if (error instanceof PouchbaseError) {
						return { ok: false, data: null, error: error as PouchbaseError<F> };
					}

					throw error;
				}
			)
	});
}
