/**
 * OAuth providers Pouchbase supports. Mirrors `OAUTH_PROVIDERS` in the app
 * (`src/lib/auth/oauth-providers.ts`); keep both in sync.
 */
export const OAUTH_PROVIDERS = ['google', 'github', 'microsoft', 'discord', 'twitch'] as const;

/** An OAuth provider id, such as `github`. */
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** An enabled OAuth provider, as returned by `GET /api/auth/providers`. */
export type OAuthProviderInfo = {
	provider: OAuthProvider;
	label: string;
};

/**
 * A row of the `users` collection. Its fields depend on the collection's schema, so everything but
 * `id` is untyped; pass your own type to `pb.auth.me<T>()` for more.
 */
export type User = Record<string, unknown> & { id: string };

/**
 * The record type of each collection, by name, such as the `Collections` interface that
 * `pouchbase types` generates. Without one, only `users` is known and its fields are untyped.
 */
export type DefaultCollections = { users: User };

/**
 * The record type of the `users` collection in `C`: a `Schema` entry (`{ $record }`) or a record
 * type.
 */
export type UserOf<C> = C extends { users: infer U }
	? (U extends { $record: infer R } ? R : U) extends infer R extends { id: string }
		? R
		: User
	: User;

/** The result of a successful sign-in or sign-up. */
export type AuthResult = {
	/** JWT (HS256), valid for 7 days. Send it as `Authorization: Bearer <token>`. */
	token: string;
	/** Id of the signed-in user. */
	userId: string;
};

/** Input for `pb.auth.signUp()`. */
export type SignUpInput = {
	username: string;
	password: string;
	email?: string;
	name?: string;
};

/** Validation messages keyed by input field, such as `{ username: 'This username is already taken' }`. */
export type Issues = Record<string, string>;
