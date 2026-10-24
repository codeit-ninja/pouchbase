import { describe, expect, it } from 'vitest';

import manifest from '../pouchbase-plugin.json' with { type: 'json' };
import { expectedHeaders, fakeContext } from '../../testing.js';
import plugin from '../server/index.js';

const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const provider = plugin.authProviders.google;

describe('google', () => {
	it('uses the OAuth endpoints, scopes and PKCE of the built-in provider', () => {
		expect(provider).toMatchObject({
			authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: 'https://oauth2.googleapis.com/token',
			scopes: ['openid', 'email', 'profile'],
			pkce: true
		});
	});

	it('maps the userinfo response', async () => {
		const { ctx, requests } = fakeContext(manifest, {
			[USERINFO]: {
				sub: '1234',
				email: 'ada@example.com',
				email_verified: true,
				name: 'Ada Lovelace',
				picture: 'https://lh3.googleusercontent.com/a/ada'
			}
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '1234',
			email: 'ada@example.com',
			emailVerified: true,
			name: 'Ada Lovelace',
			avatarUrl: 'https://lh3.googleusercontent.com/a/ada'
		});
		expect(requests.map((request) => request.url)).toEqual([USERINFO]);
		expect(Object.fromEntries(requests[0]!.headers)).toEqual(expectedHeaders('token'));
	});

	it('only trusts email_verified when it is true', async () => {
		const { ctx } = fakeContext(manifest, {
			[USERINFO]: { sub: '1234', email: 'ada@example.com', email_verified: 'true' }
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '1234',
			email: 'ada@example.com',
			emailVerified: false,
			name: null,
			avatarUrl: null
		});
	});

	it('fails when the userinfo request fails', async () => {
		const { ctx } = fakeContext(manifest, {});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).rejects.toThrow('404');
	});
});
