import type { Pouchbase, RequestOptions } from '../client.js';

/** Options for `pb.functions.invoke()`. */
export type InvokeOptions = {
	/** Defaults to `POST` with a `body`, `GET` without one. */
	method?: RequestOptions['method'];
	/** Sent as JSON. */
	body?: unknown;
	/** Path below the function, such as `/users/42`; the function reads it from `request.url`. */
	path?: string;
	/** Added to the URL; `undefined` values are left out. */
	query?: RequestOptions['query'];
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

/**
 * Serverless functions (`/api/functions/<name>`). The signed-in user's token is sent along, so the
 * function knows who calls it; functions that require sign-in answer `401` without one.
 */
export class FunctionsService {
	readonly #pb: Pouchbase<object>;

	constructor(pb: Pouchbase<object>) {
		this.#pb = pb;
	}

	/**
	 * Calls a function and returns its response body: parsed JSON, or the text when it isn't JSON
	 * (`null` for an empty body).
	 *
	 * ```ts
	 * const { message } = await pb.functions.invoke<{ message: string }>('hello', {
	 * 	body: { name: 'Ada' }
	 * });
	 * ```
	 *
	 * @throws {PouchbaseError} When the function answers with a non-2xx status, with its message
	 *   when the body is JSON with a `message`.
	 */
	invoke<T = unknown>(name: string, options: InvokeOptions = {}): Promise<T> {
		const path = options.path ? `/${options.path.replace(/^\/+/, '')}` : '';

		return this.#pb.send<T>(`/api/functions/${encodeURIComponent(name)}${path}`, {
			method: options.method,
			body: options.body,
			query: options.query,
			headers: options.headers,
			signal: options.signal
		});
	}
}
