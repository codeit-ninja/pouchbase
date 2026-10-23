import { describe, expect, it, vi } from 'vitest';

import { Pouchbase, PouchbaseError } from '../src/index.js';
import type { CollectionExport } from '../src/index.js';

type Call = { url: string; init: RequestInit };

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

function authorization(call: Call | undefined) {
	return (call?.init.headers as Record<string, string> | undefined)?.Authorization;
}

const posts = {
	id: 'c1',
	name: 'posts',
	system: false,
	settings: { rules: { list: '' } },
	fields: [],
	indexes: []
};

describe('pb.collections', () => {
	it('lists collections with the API key instead of the user token', async () => {
		const { fetch, calls } = mockFetch([200, { items: [posts] }]);
		const pb = new Pouchbase('https://pb.example.com', { fetch, apiKey: 'pbk_service' });
		pb.authStore.save({ token: 'user-token', userId: 'u1', user: null });

		expect(await pb.collections.list()).toEqual([posts]);
		expect(calls[0]?.url).toBe('https://pb.example.com/api/collections');
		expect(authorization(calls[0])).toBe('Bearer pbk_service');
	});

	it('returns null for an unknown collection', async () => {
		const { fetch, calls } = mockFetch([404, { message: 'Collection not found' }]);
		const pb = new Pouchbase('https://pb.example.com', { fetch, apiKey: 'pbk_service' });

		expect(await pb.collections.find('my posts')).toBeNull();
		expect(calls[0]?.url).toBe('https://pb.example.com/api/collections/my%20posts');
	});

	it('creates, updates and removes collections', async () => {
		const { fetch, calls } = mockFetch([201, posts], [200, posts], [204]);
		const pb = new Pouchbase('https://pb.example.com', { fetch, apiKey: 'pbk_service' });

		await pb.collections.create({ name: 'posts', fields: [{ name: 'title', type: 'text' }] });
		await pb.collections.update('posts', { fields: [] }, { force: true });
		await pb.collections.remove('posts');

		expect(calls.map((call) => [call.init.method, call.url])).toEqual([
			['POST', 'https://pb.example.com/api/collections'],
			['PATCH', 'https://pb.example.com/api/collections/posts?force=true'],
			['DELETE', 'https://pb.example.com/api/collections/posts']
		]);
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			name: 'posts',
			fields: [{ name: 'title', type: 'text' }]
		});
	});

	it('exports and imports collections', async () => {
		const file: CollectionExport = {
			format: 1,
			exportedAt: '2026-10-24T00:00:00.000Z',
			collections: [posts],
			related: []
		};
		const { fetch, calls } = mockFetch(
			[200, file],
			[200, { applied: false, plan: { steps: [], warnings: [] } }]
		);
		const pb = new Pouchbase('https://pb.example.com', { fetch, apiKey: 'pbk_service' });

		expect(await pb.collections.export({ collections: ['posts', 'tags'] })).toEqual(file);

		const result = await pb.collections.import(file, { dryRun: true, removeMissing: true });

		expect(result.applied).toBe(false);
		expect(calls[0]?.url).toBe(
			'https://pb.example.com/api/collections/export?collections=posts%2Ctags'
		);
		expect(calls[1]?.url).toBe(
			'https://pb.example.com/api/collections/import?removeMissing=true&dryRun=true'
		);
		expect(JSON.parse(String(calls[1]?.init.body))).toEqual(file);
	});

	it('needs an API key', async () => {
		const { fetch, calls } = mockFetch([200, { items: [] }]);
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const error = await pb.collections.list().catch((e) => e);

		expect(error).toBeInstanceOf(PouchbaseError);
		expect(error.status).toBe(401);
		expect(calls).toHaveLength(0);
	});
});
