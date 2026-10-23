import { AuthStore } from './auth-store.js';
import { PouchbaseError } from './error.js';
import { AuthService } from './services/auth.js';
import { FilesService } from './services/files.js';
import { FunctionsService } from './services/functions.js';
import type { DefaultCollections, Issues } from './types.js';

/** Options for `new Pouchbase()`. */
export type PouchbaseOptions = {
	/** Where the token is kept. Defaults to an in-memory `AuthStore`; use `LocalAuthStore` in browsers. */
	authStore?: AuthStore;
	/** The `fetch` to use, for example to add retries or for tests. Defaults to `globalThis.fetch`. */
	fetch?: typeof fetch;
	/** Headers sent with every request. */
	headers?: Record<string, string>;
};

/** Options for `pb.send()`. */
export type RequestOptions = {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	/** Sent as JSON. */
	body?: unknown;
	/** Added to the URL; `undefined` values are left out. */
	query?: Record<string, string | number | boolean | undefined>;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	/** Whether to send the stored token as `Authorization: Bearer`. Defaults to `true`. */
	auth?: boolean;
};

/**
 * Client for one Pouchbase instance.
 *
 * ```ts
 * const pb = new Pouchbase('https://pouchbase.example.com', { authStore: new LocalAuthStore() });
 * await pb.auth.signIn('ada', 'correct horse battery staple');
 * const user = await pb.auth.me();
 * ```
 *
 * Pass the `Collections` interface from `pouchbase types` to type the records of your collections:
 * `new Pouchbase<Collections>(url)`.
 */
export class Pouchbase<C extends object = DefaultCollections> {
	/** The instance's origin, without a trailing slash. */
	readonly baseUrl: string;
	readonly authStore: AuthStore;
	/** Sign-up, sign-in, OAuth, password resets and email verification. */
	readonly auth: AuthService<C>;
	/** URLs of files in the `files` collection. */
	readonly files: FilesService;
	/** Serverless functions. */
	readonly functions: FunctionsService;

	#fetch: typeof fetch;
	#headers: Record<string, string>;

	constructor(baseUrl: string, options: PouchbaseOptions = {}) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.authStore = options.authStore ?? new AuthStore();
		this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.#headers = options.headers ?? {};
		this.auth = new AuthService<C>(this);
		this.files = new FilesService(this);
		this.functions = new FunctionsService(this);
	}

	/** Absolute URL of an API path, such as `/api/health`. */
	buildUrl(path: string, query: RequestOptions['query'] = {}): string {
		const url = new URL(this.baseUrl + (path.startsWith('/') ? path : `/${path}`));

		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) {
				url.searchParams.set(key, String(value));
			}
		}

		return url.toString();
	}

	/**
	 * Sends a request to the API and returns the parsed JSON body.
	 * @throws {PouchbaseError} For a non-2xx response or when the request fails.
	 */
	async send<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
		const headers: Record<string, string> = { Accept: 'application/json', ...this.#headers };

		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
		}

		if (options.auth !== false && this.authStore.token) {
			headers.Authorization = `Bearer ${this.authStore.token}`;
		}

		let response: Response;

		try {
			response = await this.#fetch(this.buildUrl(path, options.query), {
				method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
				headers: { ...headers, ...options.headers },
				body: options.body === undefined ? undefined : JSON.stringify(options.body),
				signal: options.signal
			});
		} catch (cause) {
			throw new PouchbaseError('Could not reach Pouchbase', { cause });
		}

		const data = await readBody(response);

		if (!response.ok) {
			const body = (data && typeof data === 'object' ? data : {}) as {
				message?: unknown;
				issues?: unknown;
			};

			throw new PouchbaseError(
				typeof body.message === 'string' ? body.message : `Request failed (${response.status})`,
				{
					status: response.status,
					issues: isIssues(body.issues) ? body.issues : {},
					data
				}
			);
		}

		return data as T;
	}

	/** Whether the instance serves requests (`GET /api/health`). */
	async health(options: { signal?: AbortSignal } = {}): Promise<{ status: 'ok' }> {
		return this.send('/api/health', { auth: false, signal: options.signal });
	}
}

async function readBody(response: Response): Promise<unknown> {
	const text = await response.text().catch(() => '');

	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function isIssues(value: unknown): value is Issues {
	return (
		!!value &&
		typeof value === 'object' &&
		Object.values(value).every((message) => typeof message === 'string')
	);
}
