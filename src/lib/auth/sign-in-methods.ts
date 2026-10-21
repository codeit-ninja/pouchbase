import { isOAuthProvider, OAUTH_PROVIDERS, type OAuthProvider } from './oauth-providers';

/** A way a user of the app can sign in: a linked OAuth account or a password. */
export type SignInMethod = {
	provider: OAuthProvider | 'password';
	/** The user's account id at the OAuth provider; `null` for passwords. */
	providerId: string | null;
	/** When the account was linked or the password last set (ms). */
	linkedAt: number;
};

/** Label and icon of a sign-in method. Icons are literals so the icon bundler finds them. */
export function signInMethodInfo(provider: string) {
	if (isOAuthProvider(provider)) {
		return { label: OAUTH_PROVIDERS[provider].label, icon: OAUTH_PROVIDERS[provider].icon };
	}

	return { label: 'Password', icon: 'lucide:key-round' };
}
