import { defineAuthProvider, definePlugin, fetchJson } from '@pouchbasejs/plugin-sdk/server';

type DiscordUser = {
	id: string;
	username: string;
	global_name: string | null;
	email?: string | null;
	verified?: boolean;
	avatar: string | null;
};

export const discord = defineAuthProvider({
	authorizeUrl: 'https://discord.com/oauth2/authorize',
	tokenUrl: 'https://discord.com/api/oauth2/token',
	scopes: ['identify', 'email'],
	pkce: false,
	async profile(accessToken, _credentials, ctx) {
		const user = await fetchJson<DiscordUser>(
			ctx,
			'https://discord.com/api/users/@me',
			accessToken
		);

		return {
			id: user.id,
			email: user.email ?? null,
			emailVerified: user.verified === true,
			name: user.global_name ?? user.username,
			// Only a URL: the avatar itself is loaded by the browser, not fetched here.
			avatarUrl: user.avatar
				? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
				: null
		};
	}
});

export default definePlugin({ authProviders: { discord } });
