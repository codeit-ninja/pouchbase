import { afterEach, describe, expect, it, vi } from 'vitest';

import { authorizationUrl, exchangeCode } from './oauth';

const config = {
	authorizeUrl: 'https://example.com/authorize?audience=app',
	tokenUrl: 'https://example.com/token',
	scopes: ['openid', 'email'],
	pkce: true
};

const credentials = {
	clientId: 'client',
	clientSecret: 'secret',
	redirectUri: 'https://pb.example.com/api/auth/oauth2/example/callback'
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('authorizationUrl', () => {
	it('builds the URL from the provider config, with PKCE', async () => {
		const url = await authorizationUrl(config, credentials, 'state', 'verifier');

		expect(url.origin + url.pathname).toBe('https://example.com/authorize');
		expect(url.searchParams.get('audience')).toBe('app');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('client_id')).toBe('client');
		expect(url.searchParams.get('redirect_uri')).toBe(credentials.redirectUri);
		expect(url.searchParams.get('scope')).toBe('openid email');
		expect(url.searchParams.get('state')).toBe('state');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
	});

	it('leaves out the challenge without PKCE', async () => {
		const url = await authorizationUrl({ ...config, pkce: false }, credentials, 's', 'v');

		expect(url.searchParams.has('code_challenge')).toBe(false);
	});
});

describe('exchangeCode', () => {
	it('returns the access token', async () => {
		const fetch = vi.fn(async () => Response.json({ access_token: 'token' }));
		vi.stubGlobal('fetch', fetch);

		await expect(exchangeCode(config, credentials, 'code', 'verifier')).resolves.toBe('token');

		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		const body = init.body as URLSearchParams;

		expect(url).toBe('https://example.com/token');
		expect(body.get('code')).toBe('code');
		expect(body.get('code_verifier')).toBe('verifier');
		expect(body.get('client_secret')).toBe('secret');
	});

	it('throws when the provider returns no token', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }))
		);

		await expect(exchangeCode(config, credentials, 'code', 'verifier')).rejects.toThrow(
			'invalid_grant'
		);
	});
});
