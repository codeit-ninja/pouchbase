import { describe, expect, it } from 'vitest';

import manifest from '../pouchbase-plugin.json' with { type: 'json' };
import { expectedHeaders, fakeContext } from '../../testing.js';
import plugin from '../server/index.js';

const USER = 'https://api.github.com/user';
const EMAILS = 'https://api.github.com/user/emails';
const provider = plugin.authProviders.github;

const user = {
	id: 42,
	login: 'ada',
	name: 'Ada Lovelace',
	avatar_url: 'https://avatars.githubusercontent.com/u/42'
};

describe('github', () => {
	it('uses the OAuth endpoints, scopes and PKCE of the built-in provider', () => {
		expect(provider).toMatchObject({
			authorizeUrl: 'https://github.com/login/oauth/authorize',
			tokenUrl: 'https://github.com/login/oauth/access_token',
			scopes: ['read:user', 'user:email'],
			pkce: false
		});
	});

	it('maps the user and the primary email', async () => {
		const { ctx, requests } = fakeContext(manifest, {
			[USER]: user,
			[EMAILS]: [
				{ email: 'other@example.com', primary: false, verified: true },
				{ email: 'ada@example.com', primary: true, verified: true }
			]
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '42',
			email: 'ada@example.com',
			emailVerified: true,
			name: 'Ada Lovelace',
			avatarUrl: 'https://avatars.githubusercontent.com/u/42'
		});
		expect(requests.map((request) => request.url).sort()).toEqual([USER, EMAILS].sort());

		for (const request of requests) {
			expect(Object.fromEntries(request.headers)).toEqual(expectedHeaders('token'));
		}
	});

	it('falls back to the first email, the login and unverified', async () => {
		const { ctx } = fakeContext(manifest, {
			[USER]: { ...user, name: null, avatar_url: null },
			[EMAILS]: [{ email: 'ada@example.com', primary: false, verified: false }]
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '42',
			email: 'ada@example.com',
			emailVerified: false,
			name: 'ada',
			avatarUrl: null
		});
	});

	it('has no email when the user has none', async () => {
		const { ctx } = fakeContext(manifest, { [USER]: user, [EMAILS]: [] });

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toMatchObject({
			email: null,
			emailVerified: false
		});
	});
});
