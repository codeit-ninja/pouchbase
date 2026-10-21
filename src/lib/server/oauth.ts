import type { OAuthProvider } from '#lib/auth/oauth-providers.js';

/**
 * OAuth 2.0 authorization code flow for the supported providers, using plain `fetch` and Web
 * Crypto so it runs on Workers. Functions throw on errors; services wrap them in results.
 */

export type OAuthCredentials = {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
};

/** The provider's user, normalised. */
export type OAuthProfile = {
	id: string;
	email: string | null;
	/**
	 * Whether the provider guarantees the email belongs to the user. Only verified emails may be
	 * used to link a sign-in to an existing user.
	 */
	emailVerified: boolean;
	name: string | null;
	avatarUrl: string | null;
};

type ProviderConfig = {
	authorizeUrl: string;
	tokenUrl: string;
	scopes: string[];
	/** Send a PKCE code challenge. */
	pkce: boolean;
	profile: (accessToken: string, credentials: OAuthCredentials) => Promise<OAuthProfile>;
};

async function getJson<T>(url: string, accessToken: string, headers: Record<string, string> = {}) {
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
			'User-Agent': 'Pouchbase',
			...headers
		}
	});

	if (!response.ok) {
		throw new Error(`Profile request failed (${response.status}): ${url}`);
	}

	return (await response.json()) as T;
}

const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
	google: {
		authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		scopes: ['openid', 'email', 'profile'],
		pkce: true,
		async profile(accessToken) {
			const user = await getJson<{
				sub: string;
				email?: string;
				email_verified?: boolean;
				name?: string;
				picture?: string;
			}>('https://openidconnect.googleapis.com/v1/userinfo', accessToken);

			return {
				id: user.sub,
				email: user.email ?? null,
				emailVerified: user.email_verified === true,
				name: user.name ?? null,
				avatarUrl: user.picture ?? null
			};
		}
	},
	github: {
		authorizeUrl: 'https://github.com/login/oauth/authorize',
		tokenUrl: 'https://github.com/login/oauth/access_token',
		scopes: ['read:user', 'user:email'],
		pkce: false,
		async profile(accessToken) {
			const [user, emails] = await Promise.all([
				getJson<{ id: number; login: string; name: string | null; avatar_url: string | null }>(
					'https://api.github.com/user',
					accessToken
				),
				getJson<{ email: string; primary: boolean; verified: boolean }[]>(
					'https://api.github.com/user/emails',
					accessToken
				)
			]);
			const primary = emails.find((email) => email.primary) ?? emails[0];

			return {
				id: String(user.id),
				email: primary?.email ?? null,
				emailVerified: primary?.verified === true,
				name: user.name ?? user.login,
				avatarUrl: user.avatar_url
			};
		}
	},
	microsoft: {
		authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
		tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		scopes: ['openid', 'email', 'profile', 'User.Read'],
		pkce: true,
		async profile(accessToken) {
			const user = await getJson<{ sub: string; email?: string; name?: string }>(
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
	},
	discord: {
		authorizeUrl: 'https://discord.com/oauth2/authorize',
		tokenUrl: 'https://discord.com/api/oauth2/token',
		scopes: ['identify', 'email'],
		pkce: false,
		async profile(accessToken) {
			const user = await getJson<{
				id: string;
				username: string;
				global_name: string | null;
				email?: string | null;
				verified?: boolean;
				avatar: string | null;
			}>('https://discord.com/api/users/@me', accessToken);

			return {
				id: user.id,
				email: user.email ?? null,
				emailVerified: user.verified === true,
				name: user.global_name ?? user.username,
				avatarUrl: user.avatar
					? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
					: null
			};
		}
	},
	twitch: {
		authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
		tokenUrl: 'https://id.twitch.tv/oauth2/token',
		scopes: ['user:read:email'],
		pkce: false,
		async profile(accessToken, credentials) {
			const { data } = await getJson<{
				data: {
					id: string;
					login: string;
					display_name: string;
					email?: string;
					profile_image_url?: string;
				}[];
			}>('https://api.twitch.tv/helix/users', accessToken, { 'Client-Id': credentials.clientId });
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
	}
};

function base64Url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/** Random value for the `state` parameter and the PKCE code verifier. */
export function randomToken() {
	return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function codeChallenge(verifier: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64Url(new Uint8Array(digest));
}

export async function authorizationUrl(
	provider: OAuthProvider,
	credentials: OAuthCredentials,
	state: string,
	codeVerifier: string
) {
	const config = PROVIDERS[provider];
	const url = new URL(config.authorizeUrl);

	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', credentials.clientId);
	url.searchParams.set('redirect_uri', credentials.redirectUri);
	url.searchParams.set('scope', config.scopes.join(' '));
	url.searchParams.set('state', state);

	if (config.pkce) {
		url.searchParams.set('code_challenge', await codeChallenge(codeVerifier));
		url.searchParams.set('code_challenge_method', 'S256');
	}

	return url;
}

/** Exchanges the authorization code for an access token and loads the user's profile. */
export async function exchangeCode(
	provider: OAuthProvider,
	credentials: OAuthCredentials,
	code: string,
	codeVerifier: string
): Promise<OAuthProfile> {
	const config = PROVIDERS[provider];
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		redirect_uri: credentials.redirectUri,
		client_id: credentials.clientId,
		client_secret: credentials.clientSecret
	});

	if (config.pkce) {
		body.set('code_verifier', codeVerifier);
	}

	const response = await fetch(config.tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body
	});
	const tokens = (await response.json()) as { access_token?: string; error?: string };

	if (!response.ok || !tokens.access_token) {
		throw new Error(
			`Token exchange failed (${response.status}): ${tokens.error ?? 'no access token'}`
		);
	}

	return config.profile(tokens.access_token, credentials);
}
