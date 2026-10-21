import type { ErrorOf, ServiceError } from './base.service';
import type { CollectionsService } from './collections.service';
import type { DatabaseService } from './database.service';
import type { CreateFieldInput, FieldsService } from './fields.service';
import type { OAuthProvider } from '#lib/auth/oauth-providers.js';
import type { ResultAsync } from 'neverthrow';

import { eq, lt, type SQL } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { oauthCallbackPath } from '#lib/auth/oauth-providers.js';
import {
	appPassword,
	passwordSignUpSchema,
	type PasswordSignUpInput
} from '#lib/schemas/password-auth.js';

import { queryDatabase, queryObjects } from '../cloudflare/d1';
import { generateRecordId, generateToken, hashPassword, verifyPassword } from '../crypto';
import { collections, fields, oauthRequests } from '../db';
import { authorizationUrl, exchangeCode, randomToken } from '../oauth';
import { Service } from './base.service';

/** The built-in collection app users are stored in. */
export { USERS_COLLECTION } from '#lib/auth/users.js';
import { USERS_COLLECTION } from '#lib/auth/users.js';

/** Fields every user has. They are system fields: they can't be renamed or deleted. */
const AUTH_FIELDS: CreateFieldInput[] = [
	{ name: 'email', type: 'email', required: false, unique: true, options: {} },
	{ name: 'username', type: 'text', required: false, unique: true, options: {} },
	{ name: 'name', type: 'text', required: false, unique: false, options: {} },
	{ name: 'avatar_url', type: 'url', required: false, unique: false, options: {} },
	{
		name: 'verified',
		type: 'boolean',
		required: false,
		unique: false,
		defaultValue: 'false',
		options: {}
	}
];

const TOKEN_ISSUER = 'pouchbase';
const TOKEN_AUDIENCE = USERS_COLLECTION;
const TOKEN_LIFETIME = '7d';

// Once ensured, the users collection stays; cache it per isolate.
let usersReady = false;

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
};

/** Validation messages keyed by input field. */
export type AuthIssues = Record<string, string>;

type InvalidInputError = ServiceError<11025, 'INVALID_INPUT'> & { data: { issues: AuthIssues } };

type EnsureUsersError =
	| ErrorOf<ReturnType<CollectionsService['getByName']>>
	| ErrorOf<ReturnType<CollectionsService['create']>>
	| ErrorOf<ReturnType<FieldsService['list']>>
	| ErrorOf<ReturnType<FieldsService['create']>>
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

		const collectionsService = this.services.collections();

		return collectionsService
			.getByName(USERS_COLLECTION)
			.andThen((existing) =>
				existing ? okAsync(existing) : collectionsService.create(USERS_COLLECTION)
			)
			.andThen((collection) =>
				collection.system
					? okAsync(collection)
					: fromPromise(
							this.db
								.update(collections)
								.set({ system: true })
								.where(eq(collections.id, collection.id)),
							(error) => this.error(11000, 'AUTH_SETUP_FAILED', error)
						).map(() => collection)
			)
			.andThen((collection) =>
				this.services
					.fields()
					.list(collection.id)
					.andThen((existing) => {
						let chain: ResultAsync<void, EnsureUsersError> = okAsync(undefined);

						for (const field of AUTH_FIELDS) {
							const current = existing.find((candidate) => candidate.name === field.name);

							chain = chain.andThen((): ResultAsync<void, EnsureUsersError> => {
								if (!current) {
									return this.services
										.fields()
										.create(USERS_COLLECTION, { ...field, system: true })
										.map(() => undefined);
								}

								if (current.system) {
									return okAsync(undefined);
								}

								return fromPromise(
									this.db.update(fields).set({ system: true }).where(eq(fields.id, current.id)),
									(error) => this.error(11000, 'AUTH_SETUP_FAILED', error)
								).map(() => undefined);
							});
						}

						return chain;
					})
			)
			.andThen(() => this.services.database().requireApp())
			.andThen((appDatabase) =>
				fromPromise(
					(async () => {
						// Not a collection: an internal table, so it's prefixed with `_` (collection
						// names can't start with one).
						await queryDatabase(
							appDatabase.id,
							`CREATE TABLE IF NOT EXISTS "_external_auths" ("id" TEXT PRIMARY KEY NOT NULL, "user_id" TEXT NOT NULL, "provider" TEXT NOT NULL, "provider_id" TEXT NOT NULL, "created_at" INTEGER NOT NULL)`
						);
						await queryDatabase(
							appDatabase.id,
							`CREATE UNIQUE INDEX IF NOT EXISTS "_external_auths_provider" ON "_external_auths" ("provider", "provider_id")`
						);
						await queryDatabase(
							appDatabase.id,
							`CREATE INDEX IF NOT EXISTS "_external_auths_user" ON "_external_auths" ("user_id")`
						);
						// Password hashes live outside the users table, so they never show up in the
						// grid or the API.
						await queryDatabase(
							appDatabase.id,
							`CREATE TABLE IF NOT EXISTS "_passwords" ("user_id" TEXT PRIMARY KEY NOT NULL, "hash" TEXT NOT NULL, "updated_at" INTEGER NOT NULL)`
						);
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
			.get('auth_password_enabled')
			.andThen((enabled) =>
				settings
					.get('auth_password_signup')
					.map((signUp) => ({ enabled: enabled === 'true', signUp: signUp === 'true' }))
			);
	}

	updatePasswordSettings(
		input: PasswordSettings
	): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		const settings = this.services.settings();

		return settings
			.set('auth_password_enabled', String(input.enabled))
			.andThen(() => settings.set('auth_password_signup', String(input.signUp)));
	}

	/** Creates an app user with a username and password, and returns a token. */
	passwordSignUp(
		input: PasswordSignUpInput
	): ResultAsync<
		{ token: string; userId: string },
		| EnsureUsersError
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
		| ServiceError<11004, 'SIGN_IN_FAILED'>
		| ServiceError<11020, 'PASSWORD_AUTH_DISABLED'>
		| ServiceError<11021, 'SIGN_UP_DISABLED'>
		| ServiceError<11023, 'USERNAME_TAKEN'>
		| ServiceError<11024, 'EMAIL_TAKEN'>
		| InvalidInputError
		| ServiceError<11026, 'PASSWORD_AUTH_FAILED'>
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

				return okAsync(parsed.data);
			})
			.andThen((data) =>
				this.ensureUsersCollection()
					.andThen(() => this.services.database().requireApp())
					.andThen((appDatabase) =>
						fromPromise(
							(async () => {
								const databaseId = appDatabase.id;

								const [username] = await queryDatabase(
									databaseId,
									`SELECT "id" FROM "users" WHERE lower("username") = ?`,
									[data.username]
								);

								if (username) {
									return { taken: 'username' as const };
								}

								if (data.email) {
									const [email] = await queryDatabase(
										databaseId,
										`SELECT "id" FROM "users" WHERE "email" = ?`,
										[data.email]
									);

									if (email) {
										return { taken: 'email' as const };
									}
								}

								const userId = generateRecordId();
								const now = Date.now();

								await queryDatabase(
									databaseId,
									`INSERT INTO "users" ("id", "created_at", "updated_at", "username", "email", "name", "verified") VALUES (?, ?, ?, ?, ?, ?, 0)`,
									[userId, now, now, data.username, data.email ?? null, data.name || null]
								);
								await queryDatabase(
									databaseId,
									`INSERT INTO "_passwords" ("user_id", "hash", "updated_at") VALUES (?, ?, ?)`,
									[userId, await hashPassword(data.password), now]
								);

								return { userId };
							})(),
							(error) => this.error(11026, 'PASSWORD_AUTH_FAILED', error)
						)
					)
			)
			.andThen((result) => {
				if ('taken' in result) {
					return errAsync(
						result.taken === 'username'
							? this.error(11023, 'USERNAME_TAKEN')
							: this.error(11024, 'EMAIL_TAKEN')
					);
				}

				return this.signToken(result.userId).map((token) => ({ token, userId: result.userId }));
			});
	}

	/** Checks a username and password, and returns a token. */
	passwordSignIn(
		username: string,
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
	> {
		return this.passwordSettings()
			.andThen((settings) =>
				settings.enabled
					? this.services.database().requireApp()
					: errAsync(this.error(11020, 'PASSWORD_AUTH_DISABLED'))
			)
			.andThen((appDatabase) =>
				fromPromise(
					(async () => {
						const [row] = await queryDatabase(
							appDatabase.id,
							`SELECT "users"."id", "_passwords"."hash" FROM "users" JOIN "_passwords" ON "_passwords"."user_id" = "users"."id" WHERE lower("users"."username") = ?`,
							[username.trim().toLowerCase()]
						);

						if (!row) {
							// Hash anyway, so unknown usernames take as long as wrong passwords.
							await hashPassword(password);
							return null;
						}

						return (await verifyPassword(password, String(row[1]))) ? String(row[0]) : null;
					})(),
					(error) => this.error(11026, 'PASSWORD_AUTH_FAILED', error)
				)
			)
			.andThen((userId) =>
				userId
					? this.signToken(userId).map((token) => ({ token, userId }))
					: errAsync(this.error(11022, 'INVALID_CREDENTIALS'))
			);
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
	 * Starts an OAuth sign-in in a popup (like PocketBase). The app chooses a `state` and the S256
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

								if (!userId) {
									userId = generateRecordId();
									const now = Date.now();

									await queryDatabase(
										databaseId,
										`INSERT INTO "users" ("id", "created_at", "updated_at", "email", "name", "avatar_url", "verified") VALUES (?, ?, ?, ?, ?, ?, ?)`,
										[
											userId,
											now,
											now,
											email,
											profile.name,
											profile.avatarUrl,
											profile.emailVerified ? 1 : 0
										]
									);
								}

								await queryDatabase(
									databaseId,
									`INSERT INTO "_external_auths" ("id", "user_id", "provider", "provider_id", "created_at") VALUES (?, ?, ?, ?, ?)`,
									[generateRecordId(), userId, provider, profile.id, Date.now()]
								);

								return { userId };
							})(),
							(error) => this.error(11004, 'SIGN_IN_FAILED', error)
						)
					)
			)
			.andThen((result) =>
				'conflict' in result
					? errAsync(this.error(11005, 'EMAIL_IN_USE'))
					: this.signToken(result.userId).map((token) => ({ token, userId: result.userId }))
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
