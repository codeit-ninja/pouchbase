/**
 * The sign-in providers built into Pouchbase (as plugins, `plugins/auth-*` in the app). An
 * instance can have more: every installed sign-in plugin adds its own, so ask
 * `pb.auth.providers()` which ones are enabled.
 */
export const KNOWN_OAUTH_PROVIDERS = [
	'google',
	'github',
	'microsoft',
	'discord',
	'twitch'
] as const;

/** @deprecated Use `KNOWN_OAUTH_PROVIDERS`; instances can have more providers than these. */
export const OAUTH_PROVIDERS: typeof KNOWN_OAUTH_PROVIDERS = KNOWN_OAUTH_PROVIDERS;

/** One of the built-in provider ids. */
export type KnownOAuthProvider = (typeof KNOWN_OAUTH_PROVIDERS)[number];

/**
 * An OAuth provider id, such as `github`: a built-in one or one a plugin adds (any lowercase id
 * such as `gitlab` or `my-sso`).
 */
// `string & {}` keeps the built-in ids as suggestions in editors.
export type OAuthProvider = KnownOAuthProvider | (string & {});

/** An enabled OAuth provider, as returned by `GET /api/auth/providers`. */
export type OAuthProviderInfo = {
	provider: OAuthProvider;
	label: string;
	/** Absolute URL of the provider's logo (SVG), for a sign-in button; `null` when it has none. */
	iconUrl: string | null;
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

/**
 * The result of `pb.auth.signUp()`. When the instance requires a verified email, `token` is `null`
 * and the user signs in after following the link in the verification email.
 */
export type SignUpResult =
	| (AuthResult & { verificationRequired: false })
	| { token: null; userId: string; verificationRequired: true };

/** Input for `pb.auth.signUp()`. */
export type SignUpInput = {
	/** Full name, such as `Ada Lovelace`. */
	name: string;
	email: string;
	password: string;
};

/** Validation messages keyed by input field, such as `{ email: 'This email address is already in use' }`. */
export type Issues = Record<string, string>;
