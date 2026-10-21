import type { ServiceError } from './base.service';
import type { User } from './users.service';
import type { ResultAsync } from 'neverthrow';

import { eq } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { generateToken, hashToken, verifyPassword } from '../crypto';
import { sessions, users } from '../db';
import { Service } from './base.service';

export type SessionUser = Pick<User, 'id' | 'username' | 'email'>;

export const SESSION_COOKIE = 'session';

const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 30 * DAY;

export class SessionsService extends Service {
	/** Creates a session for the user and sets the session cookie. */
	create(userId: string): ResultAsync<void, ServiceError<4000, 'CREATE_SESSION_FAILED'>> {
		const token = generateToken();
		const expiresAt = new Date(Date.now() + SESSION_TTL);

		return fromPromise(
			(async () => {
				await this.db.insert(sessions).values({ id: await hashToken(token), userId, expiresAt });
			})(),
			(error) => this.error(4000, 'CREATE_SESSION_FAILED', error)
		).map(() => this.setCookie(token, expiresAt));
	}

	/**
	 * Returns the user for a session token, or `null` when the session is unknown or expired.
	 * Sessions are extended once they are past their halfway point.
	 */
	validate(
		token: string
	): ResultAsync<SessionUser | null, ServiceError<4001, 'VALIDATE_SESSION_FAILED'>> {
		return fromPromise(
			(async () => {
				const id = await hashToken(token);
				const [row] = await this.db
					.select({
						user: { id: users.id, username: users.username, email: users.email },
						expiresAt: sessions.expiresAt
					})
					.from(sessions)
					.innerJoin(users, eq(sessions.userId, users.id))
					.where(eq(sessions.id, id));

				if (!row) {
					return null;
				}

				const remaining = row.expiresAt.getTime() - Date.now();

				if (remaining <= 0) {
					await this.db.delete(sessions).where(eq(sessions.id, id));
					return null;
				}

				if (remaining < SESSION_TTL / 2) {
					const expiresAt = new Date(Date.now() + SESSION_TTL);
					await this.db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
					this.setCookie(token, expiresAt);
				}

				return row.user;
			})(),
			(error) => this.error(4001, 'VALIDATE_SESSION_FAILED', error)
		);
	}

	/** Deletes the current session and its cookie. */
	invalidate(): ResultAsync<void, ServiceError<4002, 'INVALIDATE_SESSION_FAILED'>> {
		const token = this.ctx.cookies.get(SESSION_COOKIE);
		this.ctx.cookies.delete(SESSION_COOKIE, { path: '/' });

		if (!token) {
			return okAsync(undefined);
		}

		return fromPromise(
			(async () => {
				await this.db.delete(sessions).where(eq(sessions.id, await hashToken(token)));
			})(),
			(error) => this.error(4002, 'INVALIDATE_SESSION_FAILED', error)
		);
	}

	/** Checks the credentials and starts a session. */
	login(
		username: string,
		password: string
	): ResultAsync<
		SessionUser,
		| ServiceError<3001, 'FIND_USER_FAILED'>
		| ServiceError<4000, 'CREATE_SESSION_FAILED'>
		| ServiceError<4003, 'INVALID_CREDENTIALS'>
		| ServiceError<4004, 'LOGIN_FAILED'>
	> {
		return this.services
			.users()
			.findByUsername(username)
			.andThen((user) =>
				fromPromise(
					user ? verifyPassword(password, user.passwordHash) : Promise.resolve(false),
					(error) => this.error(4004, 'LOGIN_FAILED', error)
				).andThen((valid) =>
					user && valid
						? okAsync<SessionUser>({ id: user.id, username: user.username, email: user.email })
						: errAsync(this.error(4003, 'INVALID_CREDENTIALS'))
				)
			)
			.andThen((user) => this.create(user.id).map(() => user));
	}

	private setCookie(token: string, expiresAt: Date) {
		this.ctx.cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: expiresAt
		});
	}
}
