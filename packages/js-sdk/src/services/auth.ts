import type { Pouchbase } from '../client.js';
import { PouchbaseError } from '../error.js';
import { randomString, s256 } from '../pkce.js';
import type {
	AuthResult,
	OAuthProvider,
	OAuthProviderInfo,
	SignUpInput,
	SignUpResult,
	User,
	UserOf
} from '../types.js';

/** Options for `pb.auth.signInWithOAuth()`. */
export type OAuthOptions = {
	/**
	 * Opens the provider's sign-in page. Defaults to a browser popup; pass your own to use, for
	 * example, the system browser in a desktop app.
	 */
	open?: (url: string) => void;
	/** How long to wait for the user, in milliseconds. Defaults to 5 minutes. */
	timeout?: number;
	/** How often to ask for the result, in milliseconds. Defaults to 1 second. */
	interval?: number;
	signal?: AbortSignal;
};

type SignInResponse = { token: string; user_id: string };

type SignUpResponse = { token: string | null; user_id: string; verification_required?: boolean };

type OAuthError = 'access_denied' | 'email_in_use' | 'sign_in_failed';

type OAuthResultResponse =
	| { status: 'pending' }
	| { status: 'done'; token: string; user_id: string }
	| { status: 'error'; error: OAuthError };

const OAUTH_ERRORS: Record<OAuthError, string> = {
	access_denied: 'Sign-in was cancelled',
	email_in_use:
		'An account with this email address already exists. Sign in with the provider you used before.',
	sign_in_failed: 'Sign-in failed'
};

/** Sign-up, sign-in, OAuth, password resets and email verification for app users. */
export class AuthService<C extends object = { users: User }> {
	readonly #pb: Pouchbase<C>;

	constructor(pb: Pouchbase<C>) {
		this.#pb = pb;
	}

	/** The enabled OAuth providers, to show their sign-in buttons. */
	async providers(): Promise<OAuthProviderInfo[]> {
		return this.#pb.send('/api/auth/providers', { auth: false });
	}

	/**
	 * Creates a user with a name, email and password, and sends a verification email when mail is
	 * set up. Signs them in, unless the instance requires a verified email: then `token` is `null`
	 * and `verificationRequired` is `true`.
	 * @throws {PouchbaseError} `400`/`409` with `issues` per field, `403` when sign-up is off,
	 * `503` when a verified email is required but mail isn't set up.
	 */
	async signUp(input: SignUpInput): Promise<SignUpResult> {
		const response = await this.#pb.send<SignUpResponse>('/api/auth/password/sign-up', {
			body: input,
			auth: false
		});

		if (response.token === null) {
			return { token: null, userId: response.user_id, verificationRequired: true };
		}

		return {
			...this.#save({ token: response.token, user_id: response.user_id }),
			verificationRequired: false
		};
	}

	/**
	 * Signs in with an email and a password.
	 * @throws {PouchbaseError} `401` for wrong credentials, `403` when password sign-in is off, or
	 * `403` with `code` `email_not_verified` when the address must be verified first.
	 */
	async signIn(email: string, password: string): Promise<AuthResult> {
		const response = await this.#pb.send<SignInResponse>('/api/auth/password/sign-in', {
			body: { email, password },
			auth: false
		});

		return this.#save(response);
	}

	/**
	 * Signs in with an OAuth provider in a popup. In browsers, call it straight from a click
	 * handler (before any `await`), otherwise the popup is blocked.
	 *
	 * The token never appears in a URL: the SDK proves it started the sign-in with a secret PKCE
	 * verifier and polls `POST /api/auth/oauth2/result` until the user is done.
	 * @throws {PouchbaseError} With `code` `access_denied`, `email_in_use`, `sign_in_failed`,
	 * `popup_blocked`, `popup_closed` or `timeout`.
	 */
	async signInWithOAuth(provider: OAuthProvider, options: OAuthOptions = {}): Promise<AuthResult> {
		// Opened before the first `await`, so it still counts as a direct result of the click.
		const popup = options.open ? null : openPopup();
		const state = randomString(24);
		const verifier = randomString(32);

		try {
			const url = this.#pb.buildUrl(`/api/auth/oauth2/${encodeURIComponent(provider)}`, {
				state,
				challenge: await s256(verifier)
			});

			if (popup) {
				popup.location.href = url;
			} else {
				options.open?.(url);
			}

			const deadline = Date.now() + (options.timeout ?? 5 * 60_000);
			let closed = false;

			while (Date.now() < deadline) {
				await wait(options.interval ?? 1000, options.signal);

				const result = await this.#pb.send<OAuthResultResponse>('/api/auth/oauth2/result', {
					body: { state, verifier },
					auth: false,
					signal: options.signal
				});

				if (result.status === 'done') {
					return this.#save(result);
				}

				if (result.status === 'error') {
					throw new PouchbaseError(OAUTH_ERRORS[result.error] ?? 'Sign-in failed', {
						status: 200,
						code: result.error,
						data: result
					});
				}

				// The callback page closes itself only after the result is stored, so a pending answer
				// after the popup closed means the user closed it.
				if (closed) {
					throw new PouchbaseError('The sign-in window was closed', { code: 'popup_closed' });
				}

				closed = popup?.closed ?? false;
			}

			throw new PouchbaseError('Sign-in timed out', { code: 'timeout' });
		} finally {
			popup?.close();
		}
	}

	/**
	 * The signed-in user, also kept in `authStore.user`. Returns `null` when signed out or when
	 * the token is rejected, and then clears the auth store. Typed with the `users` record of the
	 * client's collections, or pass your own type.
	 */
	async me<T extends { id: string } = UserOf<C>>(
		options: { signal?: AbortSignal } = {}
	): Promise<T | null> {
		const store = this.#pb.authStore;

		if (!store.token) {
			return null;
		}

		try {
			const user = await this.#pb.send<T>('/api/auth/me', { signal: options.signal });

			store.save({ token: store.token, userId: user.id, user: user as unknown as User });

			return user;
		} catch (error) {
			if (error instanceof PouchbaseError && error.status === 401) {
				store.clear();

				return null;
			}

			throw error;
		}
	}

	/** Signs out locally by clearing the auth store. Tokens are stateless and expire by themselves. */
	signOut(): void {
		this.#pb.authStore.clear();
	}

	/**
	 * Emails a link to choose a new password. Succeeds whether or not the address has an account.
	 * @throws {PouchbaseError} `403` when password sign-in is off, `503` when mail isn't set up.
	 */
	async requestPasswordReset(email: string): Promise<void> {
		await this.#pb.send('/api/auth/password/request-reset', { body: { email }, auth: false });
	}

	/**
	 * Sets a new password with the token from the reset email.
	 * @throws {PouchbaseError} `400` for an invalid or expired token, or `issues` for the password.
	 */
	async confirmPasswordReset(token: string, password: string): Promise<void> {
		await this.#pb.send('/api/auth/password/confirm-reset', {
			body: { token, password },
			auth: false
		});
	}

	/**
	 * Emails a link to verify the address. Succeeds whether or not the address has an account.
	 * @throws {PouchbaseError} `503` when mail isn't set up.
	 */
	async requestVerification(email: string): Promise<void> {
		await this.#pb.send('/api/auth/verification/request', { body: { email }, auth: false });
	}

	/**
	 * Marks the user as verified with the token from the verification email.
	 * @throws {PouchbaseError} `400` for an invalid or expired token.
	 */
	async confirmVerification(token: string): Promise<void> {
		await this.#pb.send('/api/auth/verification/confirm', { body: { token }, auth: false });
	}

	#save(response: SignInResponse): AuthResult {
		this.#pb.authStore.save({ token: response.token, userId: response.user_id, user: null });

		return { token: response.token, userId: response.user_id };
	}
}

function openPopup(): Window {
	const popup = globalThis.open?.('', 'pouchbase-oauth', 'width=500,height=700');

	if (!popup) {
		throw new PouchbaseError('The sign-in popup was blocked', { code: 'popup_blocked' });
	}

	return popup;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);

			return;
		}

		const timer = setTimeout(resolve, ms);

		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true }
		);
	});
}
