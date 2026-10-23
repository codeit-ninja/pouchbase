import type { Issues } from './types.js';

/** Thrown for every failed request: a non-2xx response, a network error or an unreadable body. */
export class PouchbaseError extends Error {
	override name = 'PouchbaseError';
	/** HTTP status, or `0` when no response was received. */
	readonly status: number;
	/** Machine-readable reason where the API gives one, such as `email_in_use` for OAuth sign-ins. */
	readonly code: string;
	/** Validation messages per input field, for `400` and `409` responses. */
	readonly issues: Issues;
	/** The parsed response body, if any. */
	readonly data: unknown;

	constructor(
		message: string,
		options: {
			status?: number;
			code?: string;
			issues?: Issues;
			data?: unknown;
			cause?: unknown;
		} = {}
	) {
		super(message, { cause: options.cause });
		this.status = options.status ?? 0;
		this.code = options.code ?? '';
		this.issues = options.issues ?? {};
		this.data = options.data;
	}
}
