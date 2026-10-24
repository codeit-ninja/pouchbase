import { describe, expect, it } from 'vitest';

import manifest from '../pouchbase-plugin.json' with { type: 'json' };
import { expectedHeaders, fakeContext } from '../../testing.js';
import plugin from '../server/index.js';

const USERS = 'https://api.twitch.tv/helix/users';
const provider = plugin.authProviders.twitch;

describe('twitch', () => {
	it('uses the OAuth endpoints, scopes and PKCE of the built-in provider', () => {
		expect(provider).toMatchObject({
			authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
			tokenUrl: 'https://id.twitch.tv/oauth2/token',
			scopes: ['user:read:email'],
			pkce: false
		});
	});

	it('maps the user and sends the client id', async () => {
		const { ctx, requests } = fakeContext(manifest, {
			[USERS]: {
				data: [
					{
						id: '141981764',
						login: 'ada',
						display_name: 'Ada',
						email: 'ada@example.com',
						profile_image_url: 'https://static-cdn.jtvnw.net/ada.png'
					}
				]
			}
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '141981764',
			email: 'ada@example.com',
			emailVerified: false,
			name: 'Ada',
			avatarUrl: 'https://static-cdn.jtvnw.net/ada.png'
		});
		expect(requests.map((request) => request.url)).toEqual([USERS]);
		expect(Object.fromEntries(requests[0]!.headers)).toEqual({
			...expectedHeaders('token'),
			'client-id': 'client'
		});
	});

	it('falls back to the login', async () => {
		const { ctx } = fakeContext(manifest, {
			[USERS]: { data: [{ id: '1', login: 'ada', display_name: '' }] }
		});

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).resolves.toEqual({
			id: '1',
			email: null,
			emailVerified: false,
			name: 'ada',
			avatarUrl: null
		});
	});

	it('fails without a user', async () => {
		const { ctx } = fakeContext(manifest, { [USERS]: { data: [] } });

		await expect(provider.profile('token', { clientId: 'client' }, ctx)).rejects.toThrow(
			'Twitch returned no user'
		);
	});
});
