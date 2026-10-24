import { defineAuthProvider, definePlugin, fetchJson } from '@pouchbasejs/plugin-sdk/server';

type TwitchUsers = {
	data: {
		id: string;
		login: string;
		display_name: string;
		email?: string;
		profile_image_url?: string;
	}[];
};

export const twitch = defineAuthProvider({
	authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
	tokenUrl: 'https://id.twitch.tv/oauth2/token',
	scopes: ['user:read:email'],
	pkce: false,
	async profile(accessToken, credentials, ctx) {
		// The Helix API wants the app's client id next to the user's token.
		const { data } = await fetchJson<TwitchUsers>(
			ctx,
			'https://api.twitch.tv/helix/users',
			accessToken,
			{ 'Client-Id': credentials.clientId }
		);
		const user = data[0];

		if (!user) {
			throw new Error('Twitch returned no user');
		}

		return {
			id: user.id,
			email: user.email ?? null,
			// Twitch doesn't say whether the email is verified.
			emailVerified: false,
			name: user.display_name || user.login,
			avatarUrl: user.profile_image_url ?? null
		};
	}
});

export default definePlugin({ authProviders: { twitch } });
