import { isTokenValid } from './jwt.js';
import type { User } from './types.js';

/** What an auth store holds. */
export type AuthState = {
	token: string;
	userId: string;
	/** The user from the last `pb.auth.me()`, if it was loaded. */
	user: User | null;
};

/** Called with the new state after every change; `null` after `clear()`. */
export type AuthChangeListener = (state: AuthState | null) => void;

/**
 * Keeps the token of the signed-in user in memory. Extend it (see `LocalAuthStore`) to persist the
 * token somewhere else, such as cookies or secure storage.
 */
export class AuthStore {
	#state: AuthState | null = null;
	#listeners = new Set<AuthChangeListener>();

	constructor(initial: AuthState | null = null) {
		this.#state = initial;
	}

	/** The token, or an empty string when signed out. */
	get token(): string {
		return this.#state?.token ?? '';
	}

	/** Id of the signed-in user, or an empty string when signed out. */
	get userId(): string {
		return this.#state?.userId ?? '';
	}

	/** The user from the last `pb.auth.me()`, or `null`. */
	get user(): User | null {
		return this.#state?.user ?? null;
	}

	/** Whether there is a token that hasn't expired. The server can still reject it. */
	get isValid(): boolean {
		return this.token !== '' && isTokenValid(this.token);
	}

	/** Stores a new state and notifies the listeners. */
	save(state: AuthState): void {
		this.#state = state;
		this.#emit();
	}

	/** Forgets the token (signs out locally) and notifies the listeners. */
	clear(): void {
		this.#state = null;
		this.#emit();
	}

	/**
	 * Calls `listener` after every change, and right away when `immediate` is set.
	 * @returns A function that removes the listener.
	 */
	onChange(listener: AuthChangeListener, immediate = false): () => void {
		this.#listeners.add(listener);

		if (immediate) {
			listener(this.#state);
		}

		return () => {
			this.#listeners.delete(listener);
		};
	}

	#emit() {
		for (const listener of this.#listeners) {
			listener(this.#state);
		}
	}
}

/**
 * An auth store that persists in `localStorage` (browsers only), so users stay signed in across
 * reloads. Falls back to memory when storage isn't available.
 */
export class LocalAuthStore extends AuthStore {
	readonly key: string;

	constructor(key = 'pouchbase_auth') {
		super(LocalAuthStore.#read(key));
		this.key = key;
	}

	override save(state: AuthState): void {
		LocalAuthStore.#write(this.key, JSON.stringify(state));
		super.save(state);
	}

	override clear(): void {
		LocalAuthStore.#write(this.key, null);
		super.clear();
	}

	static #read(key: string): AuthState | null {
		try {
			const raw = globalThis.localStorage?.getItem(key);
			const state: unknown = raw ? JSON.parse(raw) : null;

			if (
				state &&
				typeof state === 'object' &&
				'token' in state &&
				typeof state.token === 'string' &&
				'userId' in state &&
				typeof state.userId === 'string'
			) {
				return {
					token: state.token,
					userId: state.userId,
					user: (state as AuthState).user ?? null
				};
			}
		} catch {
			// Storage is blocked or holds something else: start signed out.
		}

		return null;
	}

	static #write(key: string, value: string | null) {
		try {
			if (value === null) {
				globalThis.localStorage?.removeItem(key);
			} else {
				globalThis.localStorage?.setItem(key, value);
			}
		} catch {
			// Storage is blocked or full: keep the state in memory only.
		}
	}
}
