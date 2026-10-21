/** OAuth providers app users can sign in with. Shared by the settings page and the server. */
export const OAUTH_PROVIDERS = {
	google: {
		label: 'Google',
		icon: 'simple-icons:google',
		consoleUrl: 'https://console.cloud.google.com/apis/credentials'
	},
	github: {
		label: 'GitHub',
		icon: 'simple-icons:github',
		consoleUrl: 'https://github.com/settings/developers'
	},
	microsoft: {
		label: 'Microsoft',
		icon: 'simple-icons:microsoft',
		consoleUrl:
			'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'
	},
	discord: {
		label: 'Discord',
		icon: 'simple-icons:discord',
		consoleUrl: 'https://discord.com/developers/applications'
	},
	twitch: {
		label: 'Twitch',
		icon: 'simple-icons:twitch',
		consoleUrl: 'https://dev.twitch.tv/console/apps'
	}
} as const;

export type OAuthProvider = keyof typeof OAUTH_PROVIDERS;

export const OAUTH_PROVIDER_IDS = Object.keys(OAUTH_PROVIDERS) as [
	OAuthProvider,
	...OAuthProvider[]
];

export function isOAuthProvider(value: string): value is OAuthProvider {
	return value in OAUTH_PROVIDERS;
}

/** Path of the callback URL to register at the provider. */
export function oauthCallbackPath(provider: OAuthProvider) {
	return `/api/auth/oauth2/${provider}/callback`;
}
