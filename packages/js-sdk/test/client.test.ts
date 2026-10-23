import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { AuthStore, Pouchbase, PouchbaseError, fetchTypes, isTokenValid } from '../src/index.js';
import type { User } from '../src/index.js';

type Call = { url: string; init: RequestInit };

/** A `fetch` that answers with the given responses in order and records every call. */
function mockFetch(...responses: [status: number, body?: unknown][]) {
	const calls: Call[] = [];
	const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
		calls.push({ url: String(input), init });

		const [status, body] = responses.shift() ?? [500, { message: 'No more responses' }];

		return new Response(body === undefined ? null : JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	});

	return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

/** An unsigned JWT that expires `seconds` from now. */
function token(seconds: number) {
	const payload = btoa(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + seconds }));

	return `eyJhbGciOiJIUzI1NiJ9.${payload.replace(/=+$/, '')}.signature`;
}

describe('Pouchbase', () => {
	it('builds URLs without double slashes', () => {
		const pb = new Pouchbase('https://pb.example.com/');

		expect(pb.buildUrl('/api/health')).toBe('https://pb.example.com/api/health');
		expect(pb.buildUrl('api/health', { a: 1, b: undefined })).toBe(
			'https://pb.example.com/api/health?a=1'
		);
	});

	it('throws a PouchbaseError with the message and issues of the API', async () => {
		const { fetch } = mockFetch([
			409,
			{ message: 'Invalid input', issues: { username: 'This username is already taken' } }
		]);
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const error = await pb.auth.signUp({ username: 'ada', password: 'secret' }).catch((e) => e);

		expect(error).toBeInstanceOf(PouchbaseError);
		expect(error.status).toBe(409);
		expect(error.message).toBe('Invalid input');
		expect(error.issues).toEqual({ username: 'This username is already taken' });
	});

	it('wraps network errors', async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const error = await pb.health().catch((e) => e);

		expect(error).toBeInstanceOf(PouchbaseError);
		expect(error.status).toBe(0);
	});
});

describe('auth', () => {
	it('signs in and stores the token', async () => {
		const { fetch, calls } = mockFetch([200, { token: 'abc', user_id: 'u1' }]);
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const listener = vi.fn();

		pb.authStore.onChange(listener);

		await expect(pb.auth.signIn('ada', 'secret')).resolves.toEqual({ token: 'abc', userId: 'u1' });
		expect(calls[0]?.url).toBe('https://pb.example.com/api/auth/password/sign-in');
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			identity: 'ada',
			password: 'secret'
		});
		expect(pb.authStore.token).toBe('abc');
		expect(listener).toHaveBeenCalledWith({ token: 'abc', userId: 'u1', user: null });
	});

	it('sends the token to /api/auth/me and keeps the user', async () => {
		const { fetch, calls } = mockFetch([200, { id: 'u1', username: 'ada' }]);
		const pb = new Pouchbase('https://pb.example.com', {
			fetch,
			authStore: new AuthStore({ token: 'abc', userId: 'u1', user: null })
		});

		await expect(pb.auth.me()).resolves.toEqual({ id: 'u1', username: 'ada' });
		expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer abc');
		expect(pb.authStore.user).toEqual({ id: 'u1', username: 'ada' });
	});

	it('clears the store when /api/auth/me rejects the token', async () => {
		const { fetch } = mockFetch([401, { message: 'Invalid or expired token' }]);
		const pb = new Pouchbase('https://pb.example.com', {
			fetch,
			authStore: new AuthStore({ token: 'abc', userId: 'u1', user: null })
		});

		await expect(pb.auth.me()).resolves.toBeNull();
		expect(pb.authStore.token).toBe('');
	});

	it('returns null from me() without a request when signed out', async () => {
		const { fetch, calls } = mockFetch();
		const pb = new Pouchbase('https://pb.example.com', { fetch });

		await expect(pb.auth.me()).resolves.toBeNull();
		expect(calls).toHaveLength(0);
	});

	it('polls the OAuth result until the sign-in is done', async () => {
		const { fetch, calls } = mockFetch(
			[202, { status: 'pending' }],
			[200, { status: 'done', token: 'abc', user_id: 'u1' }]
		);
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const open = vi.fn();

		await expect(pb.auth.signInWithOAuth('github', { open, interval: 1 })).resolves.toEqual({
			token: 'abc',
			userId: 'u1'
		});

		const url = new URL(open.mock.calls[0]?.[0]);
		const body = JSON.parse(String(calls[0]?.init.body));

		expect(url.pathname).toBe('/api/auth/oauth2/github');
		expect(url.searchParams.get('challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(body.state).toBe(url.searchParams.get('state'));
		expect(body.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
		expect(pb.authStore.token).toBe('abc');
	});

	it('throws the OAuth error code', async () => {
		const { fetch } = mockFetch([200, { status: 'error', error: 'email_in_use' }]);
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const error = await pb.auth
			.signInWithOAuth('google', { open: () => {}, interval: 1 })
			.catch((e) => e);

		expect(error).toBeInstanceOf(PouchbaseError);
		expect(error.code).toBe('email_in_use');
	});
});

describe('files', () => {
	it('builds file URLs', () => {
		const pb = new Pouchbase('https://pb.example.com');

		expect(pb.files.url('abc')).toBe('https://pb.example.com/api/files/abc');
		expect(pb.files.url({ id: 'abc' }, { thumb: '100x100', download: true })).toBe(
			'https://pb.example.com/api/files/abc?thumb=100x100&download=1'
		);
	});
});

describe('functions', () => {
	it('invokes a function with the token, a JSON body, a path and a query', async () => {
		const { fetch, calls } = mockFetch([200, { message: 'Hello Ada!' }]);
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		pb.authStore.save({ token: token(60), userId: 'u1', user: null });

		const result = await pb.functions.invoke<{ message: string }>('hello', {
			body: { name: 'Ada' },
			path: '/greet',
			query: { loud: true }
		});

		expect(result).toEqual({ message: 'Hello Ada!' });
		expect(calls[0]?.url).toBe('https://pb.example.com/api/functions/hello/greet?loud=true');
		expect(calls[0]?.init.method).toBe('POST');
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ name: 'Ada' });
		expect(new Headers(calls[0]?.init.headers).get('authorization')).toMatch(/^Bearer /);
	});

	it('throws the message of a failed function', async () => {
		const { fetch } = mockFetch([401, { message: 'Sign in to call this function' }]);
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const invoked = pb.functions.invoke('private');

		await expect(invoked).rejects.toBeInstanceOf(PouchbaseError);
		await expect(invoked).rejects.toMatchObject({
			status: 401,
			message: 'Sign in to call this function'
		});
	});
});

describe('tokens', () => {
	it('checks the expiry of a token', () => {
		expect(isTokenValid(token(60))).toBe(true);
		expect(isTokenValid(token(-60))).toBe(false);
		expect(isTokenValid('not-a-token')).toBe(false);
	});
});

describe('types', () => {
	it('downloads the generated types as text', async () => {
		const calls: string[] = [];
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			calls.push(String(input));

			return new Response('export interface Collections {}\n', {
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			});
		}) as unknown as typeof globalThis.fetch;

		await expect(
			fetchTypes('https://pb.example.com/api/types?token=secret', { fetch })
		).resolves.toBe('export interface Collections {}\n');
		expect(calls).toEqual(['https://pb.example.com/api/types?token=secret']);
	});

	it('throws the message of the API for a wrong token', async () => {
		const { fetch } = mockFetch([401, { message: 'Invalid token' }]);
		const error = await fetchTypes('https://pb.example.com/api/types?token=old', { fetch }).catch(
			(e) => e
		);

		expect(error).toBeInstanceOf(PouchbaseError);
		expect(error.status).toBe(401);
		expect(error.message).toBe('Invalid token');
	});

	it('types me() with the users record of the collections', () => {
		interface UsersRecord {
			id: string;
			username: string;
			email: string | null;
		}

		interface Collections {
			users: UsersRecord;
			posts: { id: string; title: string };
		}

		const typed = new Pouchbase<Collections>('https://pb.example.com');
		const untyped = new Pouchbase('https://pb.example.com');

		expectTypeOf(() => typed.auth.me()).returns.resolves.toEqualTypeOf<UsersRecord | null>();
		expectTypeOf(() => untyped.auth.me()).returns.resolves.toEqualTypeOf<User | null>();
	});
});
