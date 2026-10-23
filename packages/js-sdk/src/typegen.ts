import { PouchbaseError } from './error.js';

/** Options for `fetchTypes()`. */
export type FetchTypesOptions = {
	/** The `fetch` to use. Defaults to `globalThis.fetch`. */
	fetch?: typeof fetch;
	signal?: AbortSignal;
};

/**
 * Downloads the TypeScript types of every collection from `GET /api/types`. The URL, with its
 * token, is shown on the Types page of the Pouchbase admin. `pouchbase types <url>` calls this and
 * writes the result to a file.
 *
 * ```ts
 * const code = await fetchTypes('https://pouchbase.example.com/api/types?token=…');
 * ```
 * @throws {PouchbaseError} `401` for a missing or outdated token, or when the request fails.
 */
export async function fetchTypes(url: string, options: FetchTypesOptions = {}): Promise<string> {
	const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	let response: Response;

	try {
		response = await send(url, {
			headers: { Accept: 'text/plain, application/json' },
			signal: options.signal
		});
	} catch (cause) {
		throw new PouchbaseError('Could not reach Pouchbase', { cause });
	}

	const body = await response.text().catch(() => '');

	if (!response.ok) {
		let message = `Request failed (${response.status})`;

		try {
			const data: unknown = JSON.parse(body);

			if (
				data &&
				typeof data === 'object' &&
				'message' in data &&
				typeof data.message === 'string'
			) {
				message = data.message;
			}
		} catch {
			// Not JSON, e.g. an error page of a proxy.
		}

		throw new PouchbaseError(message, { status: response.status, data: body });
	}

	return body;
}
