import { describe, expect, it } from 'vitest';

import { describeEmbedded, embeddedPlugin } from './embedded';
import { parseProfile, PluginCallError } from './runtime';

describe('parseProfile', () => {
	const profile = {
		id: '1',
		email: 'ada@example.com',
		emailVerified: true,
		name: 'Ada',
		avatarUrl: null
	};

	it('accepts a valid profile', () => {
		expect(parseProfile(profile)).toEqual(profile);
	});

	it('rejects anything else with a PluginCallError', () => {
		expect(() => parseProfile({ ...profile, id: '' })).toThrow(PluginCallError);
		expect(() => parseProfile({ ...profile, emailVerified: 'yes' })).toThrow(/emailVerified/);
		expect(() => parseProfile(null)).toThrow(PluginCallError);
	});
});

/**
 * The OAuth settings the built-in providers had before they became plugins. Sign-ins with them
 * must keep working exactly as before.
 */
const BEFORE = {
	google: {
		authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		scopes: ['openid', 'email', 'profile'],
		pkce: true
	},
	github: {
		authorizeUrl: 'https://github.com/login/oauth/authorize',
		tokenUrl: 'https://github.com/login/oauth/access_token',
		scopes: ['read:user', 'user:email'],
		pkce: false
	},
	microsoft: {
		authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
		tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		scopes: ['openid', 'email', 'profile', 'User.Read'],
		pkce: true
	},
	discord: {
		authorizeUrl: 'https://discord.com/oauth2/authorize',
		tokenUrl: 'https://discord.com/api/oauth2/token',
		scopes: ['identify', 'email'],
		pkce: false
	},
	twitch: {
		authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
		tokenUrl: 'https://id.twitch.tv/oauth2/token',
		scopes: ['user:read:email'],
		pkce: false
	}
};

describe('built-in sign-in providers', () => {
	it.each(Object.entries(BEFORE))('%s keeps its id and OAuth settings', async (id, config) => {
		const plugin = embeddedPlugin(`auth-${id}`)!;
		const description = await describeEmbedded(plugin);

		expect(plugin.manifest.contributes.authProviders.map((provider) => provider.id)).toEqual([id]);
		expect(description.authProviders[id]).toEqual(config);
	});
});
