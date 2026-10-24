import { defineAuthProvider, definePlugin, fetchJson } from '@pouchbasejs/plugin-sdk/server';

/** The OpenID Connect userinfo response of Microsoft Graph. */
type MicrosoftUser = { sub: string; email?: string; name?: string };

export const microsoft = defineAuthProvider({
	authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
	tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
	scopes: ['openid', 'email', 'profile', 'User.Read'],
	pkce: true,
	async profile(accessToken, _credentials, ctx) {
		const user = await fetchJson<MicrosoftUser>(
			ctx,
			'https://graph.microsoft.com/oidc/userinfo',
			accessToken
		);

		return {
			id: user.sub,
			email: user.email ?? null,
			// Entra ID doesn't guarantee that the email claim is verified.
			emailVerified: false,
			name: user.name ?? null,
			avatarUrl: null
		};
	}
});

export default definePlugin({ authProviders: { microsoft } });
