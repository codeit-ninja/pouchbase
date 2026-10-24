import type { ErrorOf, ServiceError } from './base.service';
import type { CollectionsService } from './collections.service';
import type { DatabaseService } from './database.service';
import type { FilesService } from './files.service';
import type { CreateFieldInput, FieldsService } from './fields.service';
import type { MailTemplatesService } from './mail-templates.service';
import type { OAuthProvider } from '#lib/auth/oauth-providers.js';
import type { Result } from 'neverthrow';

import { eq, lt, type SQL } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { errAsync, fromPromise, okAsync, ResultAsync } from 'neverthrow';

import { oauthCallbackPath } from '#lib/auth/oauth-providers.js';
import {
	appPassword,
	passwordSignUpSchema,
	type PasswordSignUpInput
} from '#lib/schemas/password-auth.js';

import { batchDatabase, queryDatabase, queryObjects } from '../db/query';
import { generateRecordId, generateToken, hashPassword, verifyPassword } from '../crypto';
import { fields, oauthRequests } from '../db';
import { authorizationUrl, exchangeCode, randomToken } from '../oauth';
import { Service } from './base.service';
import { inBackground } from './realtime.service';

/** The built-in collection app users are stored in. */
export { USERS_COLLECTION } from '#lib/auth/users.js';
import { USERS_COLLECTION } from '#lib/auth/users.js';

/**
 * Fields every user has. They are system fields: they can't be renamed or deleted.
 * `avatar` is a file field: an image in the built-in `files` collection.
 */
function authFields(): CreateFieldInput[] {
	return [
		{ name: 'email', type: 'email', required: false, unique: true, options: {} },
		{ name: 'name', type: 'text', required: false, unique: false, options: {} },
		{
			name: 'avatar',
			type: 'file',
			required: false,
			unique: false,
			options: { accept: ['image/*'] }
		},
		{
			name: 'verified',
			type: 'boolean',
			required: false,
			unique: false,
			defaultValue: 'false',
			options: {}
		}
	];
}

/**
 * Auth fields of earlier versions that have been replaced. Users sign in with their email, so
 * `username` is gone too.
 */
const OUTDATED_AUTH_FIELDS = ['avatar_url', 'username'];

const TOKEN_ISSUER = 'pouchbase';
const TOKEN_AUDIENCE = USERS_COLLECTION;
const TOKEN_LIFETIME = '7d';
const RESET_TOKEN_LIFETIME = '30m';
const VERIFICATION_TOKEN_LIFETIME = '3d';

/** What an email link is for; part of the token's audience. */
type TokenPurpose = 'password_reset' | 'verification';

// Once ensured, the users collection stays; cache it per isolate.
let usersReady = false;

/** The setup that is running, so concurrent first requests share it instead of racing. */
let usersSetup: Promise<Result<void, EnsureUsersError>> | null = null;

/** How long a sign-in may take, from opening the popup to collecting the token. */
const OAUTH_REQUEST_TTL = 10 * 60 * 1000;

/** Error codes an app can receive for a failed sign-in. */
export type OAuthErrorCode = 'access_denied' | 'email_in_use' | 'sign_in_failed';

export type OAuthResult =
	| { status: 'pending' }
	| { status: 'done'; token: string; userId: string }
	| { status: 'error'; error: OAuthErrorCode };

export type AppUser = Record<string, unknown> & { id: string };

export type PasswordSettings = {
	enabled: boolean;
	/** Whether new users may sign up themselves; otherwise only admins create them. */
	signUp: boolean;
	/** Whether users must verify their email address before they can sign in with a password. */
	requireVerification: boolean;
};

/** A new user; `token` is `null` when they must verify their email address first. */
export type PasswordSignUpResult = { token: string | null; userId: string };

/** Validation messages keyed by input field. */
export type AuthIssues = Record<string, string>;

type InvalidInputError = ServiceError<11025, 'INVALID_INPUT'> & { data: { issues: AuthIssues } };

type EnsureUsersError =
	| ErrorOf<ReturnType<FilesService['ensureFilesCollection']>>
	| ErrorOf<ReturnType<CollectionsService['ensureSystem']>>
	| ErrorOf<ReturnType<FieldsService['delete']>>
	| ErrorOf<ReturnType<DatabaseService['requireApp']>>
	| ServiceError<11000, 'AUTH_SETUP_FAILED'>;

/** `state` chosen by the app: random, URL-safe. */
const CLIENT_STATE = /^[A-Za-z0-9_-]{16,128}$/;
/** S256 PKCE challenge: base64url of a SHA-256 hash. */
const CLIENT_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** PKCE verifier (RFC 7636). */
const CLIENT_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

async function s256(verifier: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));

	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export class AuthService extends Service {
	/**
	 * Creates the built-in `users` collection with its auth fields, and the `_external_auths` table
	 * that links provider accounts to users. Adopts an existing `users` collection.
	 */
	ensureUsersCollection(): ResultAsync<void, EnsureUsersError> {
		if (usersReady) {
			return okAsync(undefined);
		}

		const setup = (usersSetup ??= Promise.resolve(this.setUpUsersCollection()).then((result) => {
			usersSetup = null;
			return result;
		}));

		return new ResultAsync(setup);
	}

	private setUpUsersCollection(): ResultAsync<void, EnsureUsersError> {
		return this.services
			.files()
			.ensureFilesCollection()
			.andThen((filesCollection) =>
				this.services
					.collections()
					.ensureSystem(USERS_COLLECTION, authFields())
					.map((collection) => ({ collection, filesCollection }))
			)
			.andThen(({ collection, filesCollection }) =>
				this.services
					.fields()
					.list(collection.id)
					.andThen((existing) => {
						let chain: ResultAsync<void, EnsureUsersError> = okAsync(undefined);

						for (const field of existing.filter((candidate) =>
							OUTDATED_AUTH_FIELDS.includes(candidate.name)
						)) {
							// A field that computed fields still use stays, as an ordinary field the admin can
							// remove once those are gone.
							chain = chain.andThen(() =>
								this.services
									.fields()
									.delete(USERS_COLLECTION, field.name, { allowSystem: true })
									.orElse((failure) =>
										failure.code === 7012
											? fromPromise(
													this.db
														.update(fields)
														.set({ system: false })
														.where(eq(fields.id, field.id)),
													(error) => this.error(11000, 'AUTH_SETUP_FAILED', error)
												).map(() => undefined)
											: errAsync(failure)
									)
							);
						}

						// Earlier versions stored the avatar as a relation to `files`, then as a file field
						// with `accept: 'images'`. All hold one file id in a TEXT column, so only the field
						// definition changes.
						const avatar = existing.find((candidate) => candidate.name === 'avatar');

						if (avatar && (avatar.type === 'relation' || !Array.isArray(avatar.options.accept))) {
							chain = chain.andThen(() =>
								fromPromise(
									this.db
										.update(fields)
										.set({
											type: 'file',
											options: { collectionId: filesCollection.id, accept: ['image/*'] }
										})
										.where(eq(fields.id, avatar.id)),
									(error) => this.error(11000, 'AUTH_SETUP_FAILED', error)
								).map(() => undefined)
							);
						}

						return chain;
					})
			)
			.andThen(() => this.services.database().requireApp())
			.andThen((appDatabase) =>
				fromPromise(
					(async () => {
						// Not a collection: an internal table, so it's prefixed with `_` (collection
						// names can't start with one). Password hashes live outside the users table, so
						// they never show up in the grid or the API. One round-trip for all statements.
						await batchDatabase(appDatabase.id, [
							{
								sql: `CREATE TABLE IF NOT EXISTS "_external_auths" ("id" TEXT PRIMARY KEY NOT NULL, "user_id" TEXT NOT NULL, "provider" TEXT NOT NULL, "provider_id" TEXT NOT NULL, "created_at" INTEGER NOT NULL)`
							},
							{
								sql: `CREATE UNIQUE INDEX IF NOT EXISTS "_external_auths_provider" ON "_external_auths" ("provider", "provider_id")`
							},
							{
								sql: `CREATE INDEX IF NOT EXISTS "_external_auths_user" ON "_external_auths" ("user_id")`
							},
							{
								sql: `CREATE TABLE IF NOT EXISTS "_passwords" ("user_id" TEXT PRIMARY KEY NOT NULL, "hash" TEXT NOT NULL, "updated_at" INTEGER NOT NULL)`
							}
						]);
					})(),
					(error) => this.error(11000, 'AUTH_SETUP_FAILED', error)
				)
			)
			.map(() => {
				usersReady = true;
			});
	}

	passwordSettings(): ResultAsync<PasswordSettings, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		const settings = this.services.settings();

		return settings
			.getMany(['auth_password_enabled', 'auth_password_signup', 'auth_password_verify'])
			.map((values) => ({
				enabled: values.auth_password_enabled === 'true',
				signUp: values.auth_password_signup === 'true',
				requireVerification: values.auth_password_verify === 'true'
			}));
	}

	updatePasswordSettings(
		input: PasswordSettings
	): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		const settings = this.services.settings();

		return settings
			.set('auth_password_enabled', String(input.enabled))
			.andThen(() => settings.set('auth_password_signup', String(input.signUp)))
			.andThen(() => settings.set('auth_password_verify', String(input.requireVerification)));
	}

	/**
	 * Creates an app user with a name, email and password, and returns a token. When verification
	 * is required there is no token: the user signs in after following the link in the
	 * verification email.
	 */
	passwordSignUp(
		input: PasswordSignUpInput
	): ResultAsync<
		PasswordSignUpResult,
		| EnsureUsersError
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ServiceError<11004, 'SIGN_IN_FAILED'>
		| ServiceError<11020, 'PASSWORD_AUTH_DISABLED'>
		| ServiceError<11021, 'SIGN_UP_DISABLED'>
		| ServiceError<11024, 'EMAIL_TAKEN'>
		| InvalidInputError
		| ServiceError<11026, 'PASSWORD_AUTH_FAILED'>
		| ServiceError<11027, 'MAIL_DISABLED'>
	> {
		return this.passwordSettings()
			.andThen((settings) => {
				if (!settings.enabled) {
					return errAsync(this.error(11020, 'PASSWORD_AUTH_DISABLED'));
				}

				if (!settings.signUp) {
					return errAsync(this.error(11021, 'SIGN_UP_DISABLED'));
				}

				const parsed = passwordSignUpSchema.safeParse(input);

				if (!parsed.success) {
					return errAsync(this.invalidInput(parsed.error.issues));
				}

				const data = { ...parsed.data, requireVerification: settings.requireVerification };

				// Without mail, nobody could ever verify their address and sign in.
				return settings.requireVerification ? this.requireMail().map(() => data) : okAsync(data);
			})
			.andThen((data) =>
				this.ensureUsersCollection()
					.andThen(() => this.services.database().requireApp())
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								const databaseId = appDatabase.id;

								const [taken] = await queryDatabase(
									databaseId,
									`SELECT "id" FROM "users" WHERE "email" = ?`,
									[data.email]
								);

								if (taken) {
									return { taken: true as const };
								}

								const userId = generateRecordId();
								const now = Date.now();

								await queryDatabase(
									databaseId,
									`INSERT INTO "users" ("id", "created_at", "updated_at", "email", "name", "verified") VALUES (?, ?, ?, ?, ?, 0)`,
									[userId, now, now, data.email, data.name]
								);
								await queryDatabase(
									databaseId,
									`INSERT INTO "_passwords" ("user_id", "hash", "updated_at") VALUES (?, ?, ?)`,
									[userId, await hashPassword(data.password), now]
								);

								return { userId, requireVerification: data.requireVerification };
							})(),
							(error) => this.error(11026, 'PASSWORD_AUTH_FAILED', error)
						)
					)
			)
			.andThen((result) => {
				if ('taken' in result) {
					return errAsync(this.error(11024, 'EMAIL_TAKEN'));
				}

				return this.refreshComputed(result.userId).andThen(() =>
					result.requireVerification
						? okAsync({ token: null, userId: result.userId })
						: this.signToken(result.userId).map((token) => ({ token, userId: result.userId }))
				);
			});
	}

	/**
	 * Checks an email and password, and returns a token. When verification is required, a user
	 * whose address isn't verified yet gets `EMAIL_NOT_VERIFIED`, but only with the right password.
	 */
	passwordSignIn(
		email: string,
		password: string
	): ResultAsync<
		{ token: string; userId: string },
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ServiceError<11004, 'SIGN_IN_FAILED'>
		| ServiceError<11020, 'PASSWORD_AUTH_DISABLED'>
		| ServiceError<11022, 'INVALID_CREDENTIALS'>
		| ServiceError<11026, 'PASSWORD_AUTH_FAILED'>
		| ServiceError<11032, 'EMAIL_NOT_VERIFIED'>
	> {
		return this.passwordSettings()
			.andThen((settings) =>
				settings.enabled
					? this.services
							.database()
							.requireApp()
							.map((appDatabase) => ({ appDatabase, settings }))
					: errAsync(this.error(11020, 'PASSWORD_AUTH_DISABLED'))
			)
			.andThen(({ appDatabase, settings }) =>
				fromPromise(
					(async () => {
						const [row] = await queryDatabase(
							appDatabase.id,
							`SELECT "users"."id", "_passwords"."hash", "users"."verified" FROM "users" JOIN "_passwords" ON "_passwords"."user_id" = "users"."id" WHERE "users"."email" = ?`,
							[email.trim().toLowerCase()]
						);

						if (!row) {
							// Hash anyway, so unknown users take as long as wrong passwords.
							await hashPassword(password);
							return null;
						}

						if (!(await verifyPassword(password, String(row[1])))) {
							return null;
						}

						return {
							userId: String(row[0]),
							unverified: settings.requireVerification && !Number(row[2])
						};
					})(),
					(error) => this.error(11026, 'PASSWORD_AUTH_FAILED', error)
				)
			)
			.andThen((user) => {
				if (!user) {
					return errAsync(this.error(11022, 'INVALID_CREDENTIALS'));
				}

				if (user.unverified) {
					return errAsync(this.error(11032, 'EMAIL_NOT_VERIFIED'));
				}

				return this.signToken(user.userId).map((token) => ({ token, userId: user.userId }));
			});
	}

	/** Sets (or replaces) the password of an app user; used by admins. */
	setPassword(
		userId: string,
		password: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| InvalidInputError
		| ServiceError<11026, 'PASSWORD_AUTH_FAILED'>
	> {
		const parsed = appPassword.safeParse(password);

		if (!parsed.success) {
			return errAsync(
				this.invalidInput(parsed.error.issues.map((issue) => ({ ...issue, path: ['password'] })))
			);
		}

		return this.services
			.database()
			.requireApp()
			.andThen((appDatabase) =>
				fromPromise(
					(async () => {
						await queryDatabase(
							appDatabase.id,
							`INSERT INTO "_passwords" ("user_id", "hash", "updated_at") VALUES (?, ?, ?) ON CONFLICT ("user_id") DO UPDATE SET "hash" = excluded."hash", "updated_at" = excluded."updated_at"`,
							[userId, await hashPassword(parsed.data), Date.now()]
						);
					})(),
					(error) => this.error(11026, 'PASSWORD_AUTH_FAILED', error)
				)
			);
	}

	/**
	 * Starts an OAuth sign-in in a popup. The app chooses a `state` and the S256
	 * `challenge` of a secret verifier; only whoever knows that verifier can collect the token later
	 * (`oauthResult`). Pouchbase uses its own state and PKCE verifier towards the provider.
	 *
	 * @returns The provider's authorization URL to send the popup to.
	 */
	startOAuth(
		provider: OAuthProvider,
		clientState: string,
		clientChallenge: string
	): ResultAsync<
		string,
		| ServiceError<10001, 'GET_PROVIDER_FAILED'>
		| ServiceError<11001, 'PROVIDER_NOT_ENABLED'>
		| ServiceError<11010, 'INVALID_OAUTH_REQUEST'>
		| ServiceError<11013, 'OAUTH_REQUEST_FAILED'>
	> {
		if (!CLIENT_STATE.test(clientState) || !CLIENT_CHALLENGE.test(clientChallenge)) {
			return errAsync(this.error(11010, 'INVALID_OAUTH_REQUEST'));
		}

		const id = randomToken();
		const providerVerifier = randomToken();

		return this.enabledCredentials(provider).andThen((credentials) =>
			fromPromise(
				(async () => {
					// Clean up abandoned sign-ins on the way.
					await this.db.delete(oauthRequests).where(lt(oauthRequests.expiresAt, new Date()));

					const [existing] = await this.db
						.select({ id: oauthRequests.id })
						.from(oauthRequests)
						.where(eq(oauthRequests.clientState, clientState));

					if (existing) {
						return null;
					}

					await this.db.insert(oauthRequests).values({
						id,
						provider,
						clientState,
						clientChallenge,
						providerVerifier,
						expiresAt: new Date(Date.now() + OAUTH_REQUEST_TTL)
					});

					return (await authorizationUrl(provider, credentials, id, providerVerifier)).toString();
				})(),
				(error) => this.error(11013, 'OAUTH_REQUEST_FAILED', error)
			).andThen((url) =>
				url ? okAsync(url) : errAsync(this.error(11010, 'INVALID_OAUTH_REQUEST'))
			)
		);
	}

	/**
	 * Handles the provider's callback: signs the user in and stores the token (or an error code) on
	 * the request, for the app to collect with `oauthResult`.
	 *
	 * @param providerError The provider's `error` parameter, e.g. when the user declined.
	 */
	finishOAuth(
		provider: OAuthProvider,
		state: string,
		code: string | null,
		providerError: string | null
	): ResultAsync<
		Exclude<OAuthResult, { status: 'pending' } | { status: 'done' }> | { status: 'done' },
		ServiceError<11011, 'OAUTH_REQUEST_NOT_FOUND'> | ServiceError<11013, 'OAUTH_REQUEST_FAILED'>
	> {
		return this.findRequest(eq(oauthRequests.id, state)).andThen((request) => {
			if (!request || request.provider !== provider || request.status !== 'pending') {
				return errAsync(this.error(11011, 'OAUTH_REQUEST_NOT_FOUND'));
			}

			const outcome: ResultAsync<
				{ token: string; userId: string } | { error: OAuthErrorCode },
				never
			> = code
				? this.signIn(provider, code, request.providerVerifier).orElse((failure) =>
						okAsync({
							error: failure.code === 11005 ? 'email_in_use' : 'sign_in_failed'
						} as const)
					)
				: okAsync({
						error: providerError === 'access_denied' ? 'access_denied' : 'sign_in_failed'
					} as const);

			return outcome.andThen((result) =>
				fromPromise(
					this.db
						.update(oauthRequests)
						.set(
							'error' in result
								? { status: 'error', error: result.error }
								: { status: 'done', token: result.token, userId: result.userId }
						)
						.where(eq(oauthRequests.id, request.id)),
					(error) => this.error(11013, 'OAUTH_REQUEST_FAILED', error)
				).map(() =>
					'error' in result
						? { status: 'error' as const, error: result.error }
						: { status: 'done' as const }
				)
			);
		});
	}

	/**
	 * The outcome of a sign-in, for the app that started it. The verifier must match the challenge
	 * sent to `startOAuth`; a finished result is handed out once and then deleted.
	 */
	oauthResult(
		clientState: string,
		verifier: string
	): ResultAsync<
		OAuthResult,
		| ServiceError<11011, 'OAUTH_REQUEST_NOT_FOUND'>
		| ServiceError<11012, 'INVALID_VERIFIER'>
		| ServiceError<11013, 'OAUTH_REQUEST_FAILED'>
	> {
		if (!CLIENT_STATE.test(clientState) || !CLIENT_VERIFIER.test(verifier)) {
			return errAsync(this.error(11012, 'INVALID_VERIFIER'));
		}

		return this.findRequest(eq(oauthRequests.clientState, clientState)).andThen((request) => {
			if (!request) {
				return errAsync(this.error(11011, 'OAUTH_REQUEST_NOT_FOUND'));
			}

			return fromPromise(s256(verifier), (error) =>
				this.error(11013, 'OAUTH_REQUEST_FAILED', error)
			).andThen(
				(
					challenge
				): ResultAsync<
					OAuthResult,
					ServiceError<11012, 'INVALID_VERIFIER'> | ServiceError<11013, 'OAUTH_REQUEST_FAILED'>
				> => {
					if (challenge !== request.clientChallenge) {
						return errAsync(this.error(11012, 'INVALID_VERIFIER'));
					}

					if (request.status === 'pending') {
						return okAsync({ status: 'pending' });
					}

					const result: OAuthResult =
						request.status === 'done' && request.token && request.userId
							? { status: 'done', token: request.token, userId: request.userId }
							: { status: 'error', error: (request.error ?? 'sign_in_failed') as OAuthErrorCode };

					return fromPromise(
						this.db.delete(oauthRequests).where(eq(oauthRequests.id, request.id)),
						(error) => this.error(11013, 'OAUTH_REQUEST_FAILED', error)
					).map(() => result);
				}
			);
		});
	}

	/**
	 * Exchanges the code, finds or creates the user and returns a token.
	 *
	 * A sign-in is linked to an existing user with the same email only when the provider verified
	 * that email; otherwise anyone could take over an account by claiming its address.
	 */
	private signIn(
		provider: OAuthProvider,
		code: string,
		codeVerifier: string
	): ResultAsync<
		{ token: string; userId: string },
		| EnsureUsersError
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ServiceError<10001, 'GET_PROVIDER_FAILED'>
		| ServiceError<11001, 'PROVIDER_NOT_ENABLED'>
		| ServiceError<11003, 'OAUTH_FAILED'>
		| ServiceError<11004, 'SIGN_IN_FAILED'>
		| ServiceError<11005, 'EMAIL_IN_USE'>
	> {
		return this.enabledCredentials(provider)
			.andThen((credentials) =>
				fromPromise(exchangeCode(provider, credentials, code, codeVerifier), (error) =>
					this.error(11003, 'OAUTH_FAILED', error)
				)
			)
			.andThen((profile) =>
				this.ensureUsersCollection()
					.andThen(() => this.services.database().requireApp())
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								const databaseId = appDatabase.id;
								const email = profile.email?.toLowerCase() ?? null;

								const [link] = await queryDatabase(
									databaseId,
									`SELECT "user_id" FROM "_external_auths" WHERE "provider" = ? AND "provider_id" = ?`,
									[provider, profile.id]
								);

								if (link) {
									const [user] = await queryDatabase(
										databaseId,
										`SELECT "id" FROM "users" WHERE "id" = ?`,
										[link[0]]
									);

									if (user) {
										return { userId: String(user[0]) };
									}

									// The user was deleted; drop the stale link and sign up again.
									await queryDatabase(
										databaseId,
										`DELETE FROM "_external_auths" WHERE "provider" = ? AND "provider_id" = ?`,
										[provider, profile.id]
									);
								}

								let userId: string | null = null;

								if (email) {
									const [existing] = await queryDatabase(
										databaseId,
										`SELECT "id" FROM "users" WHERE "email" = ?`,
										[email]
									);

									if (existing) {
										if (!profile.emailVerified) {
											return { conflict: true as const };
										}

										userId = String(existing[0]);
									}
								}

								const created = !userId;

								if (!userId) {
									userId = generateRecordId();
									const now = Date.now();

									await queryDatabase(
										databaseId,
										`INSERT INTO "users" ("id", "created_at", "updated_at", "email", "name", "verified") VALUES (?, ?, ?, ?, ?, ?)`,
										[userId, now, now, email, profile.name, profile.emailVerified ? 1 : 0]
									);
								}

								await queryDatabase(
									databaseId,
									`INSERT INTO "_external_auths" ("id", "user_id", "provider", "provider_id", "created_at") VALUES (?, ?, ?, ?, ?)`,
									[generateRecordId(), userId, provider, profile.id, Date.now()]
								);

								return { userId, created, avatarUrl: profile.avatarUrl };
							})(),
							(error) => this.error(11004, 'SIGN_IN_FAILED', error)
						)
					)
			)
			.andThen((result) =>
				'conflict' in result
					? errAsync(this.error(11005, 'EMAIL_IN_USE'))
					: (result.created
							? this.refreshComputed(result.userId).andThen(() =>
									result.avatarUrl
										? this.importAvatar(result.userId, result.avatarUrl)
										: okAsync(undefined)
								)
							: okAsync(undefined)
						).andThen(() =>
							this.signToken(result.userId).map((token) => ({ token, userId: result.userId }))
						)
			);
	}

	/**
	 * Emails a link to choose a new password to the user with this email address. Nothing happens
	 * when there is no such user, so the API doesn't reveal which addresses have an account.
	 */
	requestPasswordReset(
		email: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ErrorOf<ReturnType<MailTemplatesService['send']>>
		| ServiceError<11020, 'PASSWORD_AUTH_DISABLED'>
		| ServiceError<11027, 'MAIL_DISABLED'>
		| ServiceError<11030, 'PASSWORD_RESET_FAILED'>
	> {
		return this.passwordSettings()
			.andThen((settings) =>
				settings.enabled
					? this.requireMail()
					: errAsync(this.error(11020, 'PASSWORD_AUTH_DISABLED'))
			)
			.andThen(() => this.services.database().requireApp())
			.andThen((appDatabase) =>
				fromPromise(
					(async () => {
						const [row] = await queryDatabase(
							appDatabase.id,
							`SELECT "users"."id", "users"."email", "_passwords"."updated_at" FROM "users" LEFT JOIN "_passwords" ON "_passwords"."user_id" = "users"."id" WHERE "users"."email" = ?`,
							[email.trim().toLowerCase()]
						);

						return row
							? { userId: String(row[0]), email: String(row[1]), passwordAt: Number(row[2] ?? 0) }
							: null;
					})(),
					(error) => this.error(11030, 'PASSWORD_RESET_FAILED', error)
				)
			)
			.andThen((user) => {
				if (!user) {
					return okAsync(undefined);
				}

				// The token carries the moment the password last changed, so it works once.
				return this.signPurposeToken(user.userId, 'password_reset', RESET_TOKEN_LIFETIME, {
					email: user.email,
					pwd: user.passwordAt
				})
					.mapErr((error) => this.error(11030, 'PASSWORD_RESET_FAILED', error))
					.andThen((token) =>
						this.services
							.mailTemplates()
							.send(
								'password-reset',
								[user.email],
								{ url: this.accountUrl('/account/reset-password', token), email: user.email },
								{ system: true }
							)
							.map(() => undefined)
					);
			});
	}

	/** Sets a new password with the token from the reset email. */
	confirmPasswordReset(
		token: string,
		password: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| InvalidInputError
		| ServiceError<11028, 'INVALID_RESET_TOKEN'>
		| ServiceError<11030, 'PASSWORD_RESET_FAILED'>
	> {
		const parsed = appPassword.safeParse(password);

		if (!parsed.success) {
			return errAsync(
				this.invalidInput(parsed.error.issues.map((issue) => ({ ...issue, path: ['password'] })))
			);
		}

		return this.verifyPurposeToken(token, 'password_reset')
			.mapErr(() => this.error(11028, 'INVALID_RESET_TOKEN'))
			.andThen((claims) =>
				this.services
					.database()
					.requireApp()
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								const [row] = await queryDatabase(
									appDatabase.id,
									`SELECT "users"."email", "_passwords"."updated_at" FROM "users" LEFT JOIN "_passwords" ON "_passwords"."user_id" = "users"."id" WHERE "users"."id" = ?`,
									[claims.sub]
								);

								if (!row || String(row[0]) !== claims.email || Number(row[1] ?? 0) !== claims.pwd) {
									return false;
								}

								const now = Date.now();

								// Following the link proves the address, so the user is verified too.
								const [, verified] = await batchDatabase(appDatabase.id, [
									{
										sql: `INSERT INTO "_passwords" ("user_id", "hash", "updated_at") VALUES (?, ?, ?) ON CONFLICT ("user_id") DO UPDATE SET "hash" = excluded."hash", "updated_at" = excluded."updated_at"`,
										params: [claims.sub, await hashPassword(parsed.data), now]
									},
									{
										sql: `UPDATE "users" SET "verified" = 1, "updated_at" = ? WHERE "id" = ? AND "verified" = 0 RETURNING "id"`,
										params: [now, claims.sub]
									}
								]);

								if (verified?.length) {
									this.changed('update', claims.sub);
								}

								return true;
							})(),
							(error) => this.error(11030, 'PASSWORD_RESET_FAILED', error)
						)
					)
			)
			.andThen((done) =>
				done ? okAsync(undefined) : errAsync(this.error(11028, 'INVALID_RESET_TOKEN'))
			);
	}

	/**
	 * Emails a link to verify the address to the user with this email address. Nothing happens when
	 * there is no such user or the user is verified already.
	 */
	requestVerification(
		email: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ErrorOf<ReturnType<MailTemplatesService['send']>>
		| ServiceError<11027, 'MAIL_DISABLED'>
		| ServiceError<11031, 'VERIFICATION_FAILED'>
	> {
		return this.requireMail()
			.andThen(() => this.services.database().requireApp())
			.andThen((appDatabase) =>
				fromPromise(
					queryDatabase(
						appDatabase.id,
						`SELECT "id", "email" FROM "users" WHERE "email" = ? AND "verified" = 0`,
						[email.trim().toLowerCase()]
					),
					(error) => this.error(11031, 'VERIFICATION_FAILED', error)
				)
			)
			.andThen(([row]) => {
				if (!row) {
					return okAsync(undefined);
				}

				const address = String(row[1]);

				return this.signPurposeToken(String(row[0]), 'verification', VERIFICATION_TOKEN_LIFETIME, {
					email: address
				})
					.mapErr((error) => this.error(11031, 'VERIFICATION_FAILED', error))
					.andThen((token) =>
						this.services
							.mailTemplates()
							.send(
								'verification',
								[address],
								{ url: this.accountUrl('/account/verify-email', token), email: address },
								{ system: true }
							)
							.map(() => undefined)
					);
			});
	}

	/** Marks the user as verified with the token from the verification email. */
	confirmVerification(
		token: string
	): ResultAsync<
		void,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ServiceError<11029, 'INVALID_VERIFICATION_TOKEN'>
		| ServiceError<11031, 'VERIFICATION_FAILED'>
	> {
		return this.verifyPurposeToken(token, 'verification')
			.mapErr(() => this.error(11029, 'INVALID_VERIFICATION_TOKEN'))
			.andThen((claims) =>
				this.services
					.database()
					.requireApp()
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								// Only while the user still has the address the link was sent to.
								const [row] = await queryDatabase(
									appDatabase.id,
									`SELECT "verified" FROM "users" WHERE "id" = ? AND "email" = ?`,
									[claims.sub, claims.email]
								);

								if (!row) {
									return false;
								}

								if (!Number(row[0])) {
									await queryDatabase(
										appDatabase.id,
										`UPDATE "users" SET "verified" = 1, "updated_at" = ? WHERE "id" = ?`,
										[Date.now(), claims.sub]
									);
									this.changed('update', claims.sub);
								}

								return true;
							})(),
							(error) => this.error(11031, 'VERIFICATION_FAILED', error)
						)
					)
			)
			.andThen((done) =>
				done ? okAsync(undefined) : errAsync(this.error(11029, 'INVALID_VERIFICATION_TOKEN'))
			);
	}

	/** The user a token belongs to. */
	verifyToken(
		token: string
	): ResultAsync<
		AppUser,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ServiceError<11006, 'INVALID_TOKEN'>
		| ServiceError<11007, 'USER_NOT_FOUND'>
		| ServiceError<11009, 'GET_USER_FAILED'>
	> {
		return this.tokenKey()
			.andThen((key) =>
				fromPromise(
					jwtVerify(token, key, { issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE }),
					(error) => this.error(11006, 'INVALID_TOKEN', error)
				)
			)
			.andThen(({ payload }) =>
				payload.sub ? okAsync(payload.sub) : errAsync(this.error(11006, 'INVALID_TOKEN'))
			)
			.andThen((userId) =>
				this.services
					.database()
					.requireApp()
					.andThen((appDatabase) =>
						fromPromise(
							queryObjects(appDatabase.id, `SELECT * FROM "users" WHERE "id" = ?`, [userId]),
							(error) => this.error(11009, 'GET_USER_FAILED', error)
						)
					)
			)
			.andThen(([user]) =>
				user ? okAsync(user as AppUser) : errAsync(this.error(11007, 'USER_NOT_FOUND'))
			);
	}

	/**
	 * Callback URL to register at the provider, for this deployment.
	 * Reads the request URL, so it can't be used inside a remote `query`.
	 */
	callbackUrl(provider: OAuthProvider) {
		return new URL(oauthCallbackPath(provider), this.ctx.url.origin).toString();
	}

	private invalidInput(issues: { path: PropertyKey[]; message: string }[]): InvalidInputError {
		return {
			...this.error(11025, 'INVALID_INPUT'),
			data: {
				issues: Object.fromEntries(
					issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message])
				)
			}
		};
	}

	/**
	 * Fills the computed fields of a user created by a sign-up, which inserts the row directly, and
	 * then sends its realtime event. Best effort: a sign-up never fails because of a computed field.
	 */
	private refreshComputed(userId: string): ResultAsync<void, never> {
		return this.services
			.records()
			.refreshComputed(USERS_COLLECTION, [userId])
			.orElse(() => okAsync(undefined))
			.map(() => this.changed('create', userId));
	}

	/** Sends the realtime event of a user this service wrote directly. */
	private changed(action: 'create' | 'update', userId: string) {
		inBackground(this.services.records().announceStored(USERS_COLLECTION, action, [userId]));
	}

	/**
	 * Stores the provider's profile picture in `files` and links it as the user's avatar.
	 * Best effort: a sign-in never fails because of its avatar.
	 */
	private importAvatar(userId: string, url: string): ResultAsync<void, never> {
		return this.services
			.files()
			.importImage(url, `avatar-${userId}`)
			.andThen((file) =>
				file
					? this.services
							.database()
							.requireApp()
							.andThen((appDatabase) =>
								fromPromise(
									queryDatabase(appDatabase.id, `UPDATE "users" SET "avatar" = ? WHERE "id" = ?`, [
										file.id,
										userId
									]),
									(error) => this.error(11004, 'SIGN_IN_FAILED', error)
								)
							)
							.map(() => this.changed('update', userId))
					: okAsync(undefined)
			)
			.orElse(() => okAsync(undefined));
	}

	/** A sign-in that hasn't expired yet; `null` otherwise. */
	private findRequest(
		where: SQL
	): ResultAsync<
		typeof oauthRequests.$inferSelect | null,
		ServiceError<11013, 'OAUTH_REQUEST_FAILED'>
	> {
		return fromPromise(this.db.select().from(oauthRequests).where(where), (error) =>
			this.error(11013, 'OAUTH_REQUEST_FAILED', error)
		).map(([request]) => (request && request.expiresAt > new Date() ? request : null));
	}

	private enabledCredentials(provider: OAuthProvider) {
		return this.services
			.oauthProviders()
			.credentials(provider)
			.andThen((credentials) =>
				credentials?.enabled && credentials.clientId && credentials.clientSecret
					? okAsync({
							clientId: credentials.clientId,
							clientSecret: credentials.clientSecret,
							redirectUri: this.callbackUrl(provider)
						})
					: errAsync(this.error(11001, 'PROVIDER_NOT_ENABLED'))
			);
	}

	private signToken(
		userId: string
	): ResultAsync<
		string,
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ServiceError<11004, 'SIGN_IN_FAILED'>
	> {
		return this.tokenKey().andThen((key) =>
			fromPromise(
				new SignJWT({ collection: USERS_COLLECTION })
					.setProtectedHeader({ alg: 'HS256' })
					.setSubject(userId)
					.setIssuer(TOKEN_ISSUER)
					.setAudience(TOKEN_AUDIENCE)
					.setIssuedAt()
					.setExpirationTime(TOKEN_LIFETIME)
					.sign(key),
				(error) => this.error(11004, 'SIGN_IN_FAILED', error)
			)
		);
	}

	/**
	 * A token for one purpose (an email link). Its audience differs from sign-in tokens, so it can
	 * never be used as one, nor for the other purpose.
	 */
	private signPurposeToken(
		userId: string,
		purpose: TokenPurpose,
		lifetime: string,
		claims: { email: string; pwd?: number }
	) {
		return this.tokenKey().andThen((key) =>
			fromPromise(
				new SignJWT(claims)
					.setProtectedHeader({ alg: 'HS256' })
					.setSubject(userId)
					.setIssuer(TOKEN_ISSUER)
					.setAudience(`${TOKEN_AUDIENCE}:${purpose}`)
					.setIssuedAt()
					.setExpirationTime(lifetime)
					.sign(key),
				(error) => this.error(11004, 'SIGN_IN_FAILED', error)
			)
		);
	}

	private verifyPurposeToken(token: string, purpose: TokenPurpose) {
		return this.tokenKey()
			.andThen((key) =>
				fromPromise(
					jwtVerify(token, key, {
						issuer: TOKEN_ISSUER,
						audience: `${TOKEN_AUDIENCE}:${purpose}`
					}),
					(error) => this.error(11006, 'INVALID_TOKEN', error)
				)
			)
			.andThen(({ payload }) =>
				payload.sub && typeof payload.email === 'string'
					? okAsync({
							sub: payload.sub,
							email: payload.email,
							pwd: typeof payload.pwd === 'number' ? payload.pwd : 0
						})
					: errAsync(this.error(11006, 'INVALID_TOKEN'))
			);
	}

	/** Flows that send mail need mail settings. */
	private requireMail() {
		return this.services
			.mail()
			.enabled()
			.andThen((enabled) =>
				enabled ? okAsync(undefined) : errAsync(this.error(11027, 'MAIL_DISABLED'))
			);
	}

	/** Link to a page of this deployment that handles an email link. */
	private accountUrl(path: string, token: string) {
		const url = new URL(path, this.ctx.url.origin);
		url.searchParams.set('token', token);
		return url.toString();
	}

	/** Signing key for user tokens; generated on first use and stored in the settings. */
	private tokenKey(): ResultAsync<
		Uint8Array<ArrayBuffer>,
		ServiceError<5000, 'GET_SETTING_FAILED'> | ServiceError<5001, 'SET_SETTING_FAILED'>
	> {
		const settings = this.services.settings();

		return settings
			.get('auth_token_secret')
			.andThen((secret) => {
				if (secret) {
					return okAsync(secret);
				}

				const generated = generateToken();
				return settings.set('auth_token_secret', generated).map(() => generated);
			})
			.map((secret) => new TextEncoder().encode(secret));
	}
}
