import { describe, expect, it, vi } from 'vitest';

import { Pouchbase, PouchbaseError } from '../src/index.js';

function mockFetch(status: number, body: unknown) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
		calls.push({ url: String(input), init });

		return new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	});

	return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

describe('pb.mail', () => {
	it('sends a template with the API key instead of the user token', async () => {
		const { fetch, calls } = mockFetch(200, { sent: 2 });
		const pb = new Pouchbase('https://pb.example.com', { fetch, apiKey: 'pbk_secret' });
		pb.authStore.save({ token: 'user-token', userId: 'u1', user: null });

		const result = await pb.mail.send({
			template: 'welcome',
			to: ['ada@example.com', 'alan@example.com'],
			variables: { name: 'Ada' }
		});

		expect(result).toEqual({ sent: 2 });
		expect(calls).toHaveLength(1);

		const { url, init } = calls[0] ?? { url: '', init: {} };

		expect(url).toBe('https://pb.example.com/api/mail/send');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer pbk_secret');
		expect(JSON.parse(String(init.body))).toEqual({
			template: 'welcome',
			to: ['ada@example.com', 'alan@example.com'],
			variables: { name: 'Ada' }
		});
	});

	it('needs an API key', async () => {
		const { fetch, calls } = mockFetch(200, { sent: 1 });
		const pb = new Pouchbase('https://pb.example.com', { fetch });
		const error = await pb.mail
			.send({ template: 'welcome', to: 'ada@example.com' })
			.catch((e) => e);

		expect(error).toBeInstanceOf(PouchbaseError);
		expect(error.kind).toBe('unauthorized');
		expect(calls).toHaveLength(0);
	});

	it('passes on missing variables as issues', async () => {
		const { fetch } = mockFetch(422, {
			message: 'Missing variables: name',
			issues: { 'variables.name': 'Required' }
		});
		const pb = new Pouchbase('https://pb.example.com', { fetch, apiKey: 'pbk_secret' });
		const error = await pb.mail
			.send({ template: 'welcome', to: 'ada@example.com' })
			.catch((e) => e);

		expect(error.status).toBe(422);
		expect(error.issues).toEqual({ 'variables.name': 'Required' });
	});
});
