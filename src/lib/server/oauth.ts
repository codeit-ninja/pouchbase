import type { ProviderConfig } from './plugins/runtime';

/**
 * OAuth 2.0 authorization code flow, using plain `fetch` and Web Crypto so it runs on Workers. The
 * URLs, scopes and PKCE setting come from the plugin that contributes the provider (its `describe`
 * answer, stored in `plugin_auth_providers`); loading the user's profile is up to the plugin
 * (`profile`). Functions throw on errors; services wrap them in results.
 */

export type OAuthCredentials = {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
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
	config: ProviderConfig,
	credentials: OAuthCredentials,
	state: string,
	codeVerifier: string
) {
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

/** Exchanges the authorization code for an access token. */
export async function exchangeCode(
	config: ProviderConfig,
	credentials: OAuthCredentials,
	code: string,
	codeVerifier: string
): Promise<string> {
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

	return tokens.access_token;
}
