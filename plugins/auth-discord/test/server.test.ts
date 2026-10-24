import { describe, expect, it } from 'vitest';

import manifest from '../pouchbase-plugin.json' with { type: 'json' };
import { expectedHeaders, fakeContext } from '../../testing.js';
import plugin from '../server/index.js';

const ME = 'https://discord.com/api/users/@me';
const provider = plugin.authProviders.discord;

describe('discord', () => {
	it('uses the OAuth endpoints, scopes and PKCE of the built-in provider', () => {
		expect(provider).toMatchObject({
			authorizeUrl: 'https://discord.com/oauth2/authorize',
			tokenUrl: 'https://discord.com/api/oauth2/token',
			scopes: ['identify', 'email'],
			pkce: false
		});
	});

	it('maps the user, with the avatar on the CDN', async () => {
		const { ctx, requests } = fakeContext(manifest, {
			[ME]: {
				id: '80351110224678912',
				username: 'ada',
				global_name: 'Ada Lovelace',
				email: 'ada@example.com',
				verified: true,
				avatar: '8342729096ea3675442027381ff50dfe'
			}
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '80351110224678912',
			email: 'ada@example.com',
			emailVerified: true,
			name: 'Ada Lovelace',
			avatarUrl:
				'https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png'
		});
		expect(requests.map((request) => request.url)).toEqual([ME]);
		expect(Object.fromEntries(requests[0]!.headers)).toEqual(expectedHeaders('token'));
	});

	it('falls back to the username, no avatar and unverified', async () => {
		const { ctx } = fakeContext(manifest, {
			[ME]: { id: '1', username: 'ada', global_name: null, email: null, avatar: null }
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '1',
			email: null,
			emailVerified: false,
			name: 'ada',
			avatarUrl: null
		});
	});
});
