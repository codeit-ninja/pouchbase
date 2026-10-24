import type { OAuthProvider } from './oauth-providers';

/** A way a user of the app can sign in: a linked OAuth account or a password. */
export type SignInMethod = {
	provider: OAuthProvider | 'password';
	/** The provider's name, e.g. `GitHub`; the id when no plugin contributes the provider anymore. */
	label: string;
	/** The provider's logo; `null` for passwords and providers without one. */
	iconUrl: string | null;
	/** The user's account id at the OAuth provider; `null` for passwords. */
	providerId: string | null;
	/** When the account was linked or the password last set (ms). */
	linkedAt: number;
};

/** The fallback icon of a sign-in method without a logo. Literals, so the icon bundler finds them. */
export function signInMethodIcon(method: Pick<SignInMethod, 'provider'>) {
	return method.provider === 'password' ? 'lucide:key-round' : 'lucide:log-in';
}
