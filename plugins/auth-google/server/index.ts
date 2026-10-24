import { defineAuthProvider, definePlugin, fetchJson } from '@pouchbasejs/plugin-sdk/server';

/** The OpenID Connect userinfo response of Google. */
type GoogleUser = {
	sub: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	picture?: string;
};

export const google = defineAuthProvider({
	authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	scopes: ['openid', 'email', 'profile'],
	pkce: true,
	async profile(accessToken, _credentials, ctx) {
		const user = await fetchJson<GoogleUser>(
			ctx,
			'https://openidconnect.googleapis.com/v1/userinfo',
			accessToken
		);

		return {
			id: user.sub,
			email: user.email ?? null,
			emailVerified: user.email_verified === true,
			name: user.name ?? null,
			avatarUrl: user.picture ?? null
		};
	}
});

export default definePlugin({ authProviders: { google } });
