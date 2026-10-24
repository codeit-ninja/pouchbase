import { describe, expect, it } from 'vitest';

import manifest from '../pouchbase-plugin.json' with { type: 'json' };
import { expectedHeaders, fakeContext } from '../../testing.js';
import plugin from '../server/index.js';

const USERINFO = 'https://graph.microsoft.com/oidc/userinfo';
const provider = plugin.authProviders.microsoft;

describe('microsoft', () => {
	it('uses the OAuth endpoints, scopes and PKCE of the built-in provider', () => {
		expect(provider).toMatchObject({
			authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
			tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
			scopes: ['openid', 'email', 'profile', 'User.Read'],
			pkce: true
		});
	});

	it('maps the userinfo response and never trusts the email', async () => {
		const { ctx, requests } = fakeContext(manifest, {
			[USERINFO]: {
				sub: 'AAAA-bbbb',
				email: 'ada@example.com',
				email_verified: true,
				name: 'Ada Lovelace',
				picture: 'https://graph.microsoft.com/v1.0/me/photo/$value'
			}
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: 'AAAA-bbbb',
			email: 'ada@example.com',
			emailVerified: false,
			name: 'Ada Lovelace',
			avatarUrl: null
		});
		expect(requests.map((request) => request.url)).toEqual([USERINFO]);
		expect(Object.fromEntries(requests[0]!.headers)).toEqual(expectedHeaders('token'));
	});

	it('maps missing claims to null', async () => {
		const { ctx } = fakeContext(manifest, { [USERINFO]: { sub: 'AAAA-bbbb' } });

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: 'AAAA-bbbb',
			email: null,
			emailVerified: false,
			name: null,
			avatarUrl: null
		});
	});
});
