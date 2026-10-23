import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
	AuthStore,
	createClient,
	Pouchbase,
	PouchbaseError,
	fetchTypes,
	filter,
	isPouchbaseError,
	isTokenValid
} from '../src/index.js';
import type { JsonValue, Page, User } from '../src/index.js';
import { compileOrderBy, compileWhere } from '../src/query.js';

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

describe('db', () => {
	interface PostsRecord {
		id: string;
		created_at: number;
		title: string;
		status: 'draft' | 'published' | null;
		views: number | null;
		published: boolean;
		tags: string[];
		meta: JsonValue;
	}

	interface PostsCreate {
		title: string;
		status?: 'draft' | 'published' | null;
		views?: number | null;
		published?: boolean | null;
		tags?: string[] | null;
	}

	interface Schema {
		users: { $record: User & { name: string | null }; $create: { name?: string | null } };
		posts: { $record: PostsRecord; $create: PostsCreate };
	}

	const page = (items: unknown[], pageNumber = 1, totalPages = 1) => ({
		page: pageNumber,
		perPage: 2,
		totalItems: items.length,
		totalPages,
		items
	});

	const query = (url: string | undefined) =>
		Object.fromEntries(new URL(url ?? 'https://x').searchParams);

	it('compiles where, orderBy, select, limit and page into the query', async () => {
		const { fetch, calls } = mockFetch([200, page([{ id: 'p1', title: 'Hi' }], 2, 3)]);
		const pb = createClient<Schema>('https://pb.example.com', { fetch });

		const result = await pb.db.posts.findMany({
			where: {
				status: 'published',
				views: { gte: 10, lt: 100 },
				title: { contains: 'say "hi"' },
				tags: { has: 'news' },
				$or: [{ published: true }, { status: null }]
			},
			orderBy: { created_at: 'desc', title: 'asc' },
			select: ['id', 'title'],
			limit: 10,
			page: 2
		});

		expect(result).toEqual({
			items: [{ id: 'p1', title: 'Hi' }],
			total: 1,
			page: 2,
			pages: 3,
			hasMore: true
		});
		expect(new URL(calls[0]!.url).pathname).toBe('/api/collections/posts/records');
		expect(query(calls[0]?.url)).toEqual({
			page: '2',
			perPage: '10',
			filter:
				'status = "published" && views >= 10 && views < 100 && title ~ "say \\"hi\\"" && ' +
				'tags ?= "news" && (published = true || status = null)',
			sort: '-created_at,title',
			fields: 'id,title'
		});
	});

	it('compiles in, notIn, isEmpty and empty groups', () => {
		expect(compileWhere({ status: { in: ['a', 'b'] }, views: { notIn: [1, 2] } })).toBe(
			'(status = "a" || status = "b") && views != 1 && views != 2'
		);
		expect(compileWhere({ status: { in: [] } })).toBe('1 = 0');
		expect(compileWhere({ tags: { isEmpty: true } })).toBe('tags = ""');
		expect(compileWhere({ $or: [] })).toBe('1 = 0');
		expect(compileWhere({ $or: [{}, { a: 1 }] })).toBe('');
		expect(compileWhere({ created: { gt: new Date(0) } })).toBe(
			'created > "1970-01-01T00:00:00.000Z"'
		);
	});

	it('refuses field names that could change the filter', () => {
		expect(() => compileWhere({ 'title = "x" || id': 'y' })).toThrow(TypeError);
		expect(() => compileOrderBy({ 'id,-x': 'asc' })).toThrow(TypeError);
	});

	it('escapes values in hand-written filters', () => {
		expect(compileWhere(filter`author = @request.auth.id || title ~ ${'a"b\\c'} && n > ${5}`)).toBe(
			'author = @request.auth.id || title ~ "a\\"b\\\\c" && n > 5'
		);
	});

	it('returns null from find() and findFirst() when nothing is found', async () => {
		const { fetch } = mockFetch([404, { message: 'Record not found' }], [200, page([])]);
		const pb = createClient<Schema>('https://pb.example.com', { fetch });

		await expect(pb.db.posts.find('missing')).resolves.toBeNull();
		await expect(pb.db.posts.findFirst({ where: { title: 'x' } })).resolves.toBeNull();
	});

	it('still fails when the collection does not exist', async () => {
		const { fetch } = mockFetch([404, { message: 'Collection not found' }]);
		const pb = createClient('https://pb.example.com', { fetch });

		await expect(pb.db.$collection('nope').find('p1')).rejects.toMatchObject({
			kind: 'not_found'
		});
	});

	it('iterates and collects every page', async () => {
		const { fetch, calls } = mockFetch(
			[200, page([{ id: 'a' }, { id: 'b' }], 1, 2)],
			[200, page([{ id: 'c' }], 2, 2)]
		);
		const pb = createClient<Schema>('https://pb.example.com', { fetch });

		await expect(pb.db.posts.findAll({ batchSize: 2 })).resolves.toEqual([
			{ id: 'a' },
			{ id: 'b' },
			{ id: 'c' }
		]);
		expect(calls.map((call) => query(call.url).page)).toEqual(['1', '2']);
	});

	it('counts records', async () => {
		const { fetch, calls } = mockFetch([200, { ...page([{ id: 'a' }]), totalItems: 42 }]);
		const pb = createClient<Schema>('https://pb.example.com', { fetch });

		await expect(pb.db.posts.count({ status: 'draft' })).resolves.toBe(42);
		expect(query(calls[0]?.url)).toMatchObject({ perPage: '1', filter: 'status = "draft"' });
	});

	it('inserts, patches and removes records with the token', async () => {
		const { fetch, calls } = mockFetch(
			[200, { id: 'p1', title: 'Hello' }],
			[200, { id: 'p1', title: 'Hi' }],
			[204]
		);
		const pb = createClient<Schema>('https://pb.example.com', { fetch });
		pb.authStore.save({ token: token(60), userId: 'u1', user: null });

		await expect(pb.db.posts.insert({ title: 'Hello', published: true })).resolves.toEqual({
			id: 'p1',
			title: 'Hello'
		});
		await pb.db.posts.patch('p1', { title: 'Hi' }, { select: ['title'] });
		await expect(pb.db.posts.remove('p1')).resolves.toBeUndefined();

		expect(calls.map((call) => [call.init.method, new URL(call.url).pathname])).toEqual([
			['POST', '/api/collections/posts/records'],
			['PATCH', '/api/collections/posts/records/p1'],
			['DELETE', '/api/collections/posts/records/p1']
		]);
		expect(query(calls[1]?.url)).toEqual({ fields: 'title' });
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ title: 'Hello', published: true });
		expect(new Headers(calls[0]?.init.headers).get('authorization')).toMatch(/^Bearer /);
	});

	it('returns failures as a result with .safe()', async () => {
		const { fetch } = mockFetch(
			[400, { message: 'Invalid record', issues: { title: 'Required' } }],
			[200, { id: 'p1', title: 'Hello' }]
		);
		const pb = createClient<Schema>('https://pb.example.com', { fetch });

		const failed = await pb.db.posts.insert({ title: '' }).safe();

		expect(failed.ok).toBe(false);
		expect(failed.error).toBeInstanceOf(PouchbaseError);
		expect(failed.error?.kind).toBe('invalid');
		expect(failed.error?.issues.title).toBe('Required');

		const done = await pb.db.posts.insert({ title: 'Hello' }).safe();

		expect(done).toEqual({ ok: true, data: { id: 'p1', title: 'Hello' }, error: null });
	});

	it('tells error kinds apart', async () => {
		const { fetch } = mockFetch([403, { message: 'Only admins can do this' }]);
		const pb = createClient<Schema>('https://pb.example.com', { fetch });
		const error = await pb.db.posts.findMany().catch((caught: unknown) => caught);

		expect(isPouchbaseError(error, 'forbidden')).toBe(true);
		expect(isPouchbaseError(error, 'not_found')).toBe(false);
	});

	it('is not mistaken for a promise', async () => {
		const pb = createClient<Schema>('https://pb.example.com');

		await expect(Promise.resolve(pb.db)).resolves.toBe(pb.db);
	});

	it('types records, selections, conditions and inputs from the schema', () => {
		const pb = createClient<Schema>('https://pb.example.com');

		expectTypeOf(() => pb.db.posts.find('p1')).returns.resolves.toEqualTypeOf<PostsRecord | null>();
		expectTypeOf(() =>
			pb.db.posts.find('p1', { select: ['id', 'title'] })
		).returns.resolves.toEqualTypeOf<{ id: string; title: string } | null>();
		expectTypeOf(() => pb.db.posts.findMany({ select: ['views'] })).returns.resolves.toEqualTypeOf<
			Page<{ views: number | null }>
		>();
		expectTypeOf(() => pb.auth.me()).returns.resolves.toEqualTypeOf<
			(User & { name: string | null }) | null
		>();
		expectTypeOf(() => pb.db.$collection('other').find('x')).returns.resolves.toEqualTypeOf<Record<
			string,
			unknown
		> | null>();

		// Only type-checked, never run.
		expectTypeOf(() => {
			// @ts-expect-error: `titel` is not a field of posts.
			void pb.db.posts.findMany({ where: { titel: 'x' } });
			// @ts-expect-error: numbers have no `contains`.
			void pb.db.posts.findMany({ where: { views: { contains: '1' } } });
			// @ts-expect-error: `status` only takes its items.
			void pb.db.posts.findMany({ where: { status: 'archived' } });
			// @ts-expect-error: arrays are matched with `has`.
			void pb.db.posts.findMany({ where: { tags: 'news' } });
			// @ts-expect-error: `title` is required to create a post.
			void pb.db.posts.insert({ views: 1 });
			// @ts-expect-error: `id` is filled in by Pouchbase.
			void pb.db.posts.insert({ title: 'x', id: 'mine' });
			// @ts-expect-error: only fields can be selected.
			void pb.db.posts.find('p1', { select: ['nope'] });
			// @ts-expect-error: `pages` is not a collection of the schema.
			void pb.db.pages;
		}).toBeFunction();
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
