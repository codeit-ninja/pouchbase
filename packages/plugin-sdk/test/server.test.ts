import type { PluginContext } from '../src/server.js';

import { describe, expect, it, vi } from 'vitest';

import { createOidcProvider, fetchJson } from '../src/server.js';

function context(body: unknown, status = 200) {
	const fetch = vi.fn(async () => Response.json(body, { status }));
	const ctx: PluginContext = {
		plugin: { id: 'auth-test', version: '1.0.0' },
		fetch: fetch as unknown as typeof globalThis.fetch,
		settings: { get: async () => null },
		log: { info() {}, warn() {}, error() {} }
	};

	return { ctx, fetch };
}

const options = {
	authorizeUrl: 'https://id.example.com/authorize',
	tokenUrl: 'https://id.example.com/token',
	userinfoUrl: 'https://id.example.com/userinfo'
};

describe('fetchJson', () => {
	it('sends the access token and merges headers', async () => {
		const { ctx, fetch } = context({ id: 1 });

		await expect(
			fetchJson(ctx, 'https://api.example.com/user', 'token', { 'Client-Id': 'abc' })
		).resolves.toEqual({ id: 1 });
		expect(fetch).toHaveBeenCalledWith('https://api.example.com/user', {
			headers: {
				Authorization: 'Bearer token',
				Accept: 'application/json',
				'User-Agent': 'Pouchbase',
				'Client-Id': 'abc'
			}
		});
	});

	it('throws on a non-2xx response', async () => {
		const { ctx } = context({ error: 'nope' }, 401);

		await expect(fetchJson(ctx, 'https://api.example.com/user', 'token')).rejects.toThrow(
			'Request failed (401)'
		);
	});
});

describe('createOidcProvider', () => {
	it('has OIDC defaults', () => {
		const provider = createOidcProvider(options);

		expect(provider.scopes).toEqual(['openid', 'email', 'profile']);
		expect(provider.pkce).toBe(true);
	});

	it('maps the userinfo claims to a profile', async () => {
		const { ctx, fetch } = context({
			sub: '123',
			email: 'jane@example.com',
			email_verified: true,
			name: 'Jane',
			picture: 'https://example.com/jane.png'
		});
		const profile = await createOidcProvider(options).profile('token', { clientId: 'id' }, ctx);

		expect(fetch).toHaveBeenCalledWith(options.userinfoUrl, expect.anything());
		expect(profile).toEqual({
			id: '123',
			email: 'jane@example.com',
			emailVerified: true,
			name: 'Jane',
			avatarUrl: 'https://example.com/jane.png'
		});
	});

	it('treats missing claims as null and unverified', async () => {
		const { ctx } = context({ sub: '123', email_verified: true, preferred_username: 'jane' });
		const profile = await createOidcProvider(options).profile('token', { clientId: 'id' }, ctx);

		expect(profile).toEqual({
			id: '123',
			email: null,
			emailVerified: false,
			name: 'jane',
			avatarUrl: null
		});
	});

	it('lets mapProfile adjust the profile', async () => {
		const { ctx } = context({ sub: '123', email: 'jane@example.com', email_verified: 'true' });
		const provider = createOidcProvider({
			...options,
			mapProfile: (_claims, profile) => ({ ...profile, emailVerified: false })
		});

		await expect(provider.profile('token', { clientId: 'id' }, ctx)).resolves.toMatchObject({
			email: 'jane@example.com',
			emailVerified: false
		});
	});

	it('rejects a response without sub', async () => {
		const { ctx } = context({ email: 'jane@example.com' });

		await expect(
			createOidcProvider(options).profile('token', { clientId: 'id' }, ctx)
		).rejects.toThrow('no sub claim');
	});
});
