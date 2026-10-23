import type { ServiceError } from './base.service';
import type { ResultAsync } from 'neverthrow';

import { asc, eq, or } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { hashPassword } from '../crypto';
import { users } from '../db';
import { Service } from './base.service';

export type User = typeof users.$inferSelect;

/** A user without the password hash, safe to send to the browser. */
export type UserSummary = Omit<User, 'passwordHash'>;

export type CreateUserInput = {
	username: string;
	email: string;
	password: string;
};

/** SQLite (D1 or a local file) reports `no such table` when the migrations haven't run yet. */
function isMissingTable(error: unknown) {
	const cause = error instanceof Error && error.cause ? error.cause : error;
	return cause instanceof Error && cause.message.includes('no such table');
}

export class UsersService extends Service {
	/** Whether at least one user exists. A database without tables counts as "no users". */
	hasAny(): ResultAsync<boolean, ServiceError<3000, 'HAS_USERS_FAILED'>> {
		return fromPromise(
			(async () => {
				try {
					const [user] = await this.db.select({ id: users.id }).from(users).limit(1);
					return user !== undefined;
				} catch (error) {
					if (isMissingTable(error)) {
						return false;
					}

					throw error;
				}
			})(),
			(error) => this.error(3000, 'HAS_USERS_FAILED', error)
		);
	}

	/** Finds a user by username or, when the identity contains an `@`, by email address. */
	findByIdentity(
		identity: string
	): ResultAsync<User | null, ServiceError<3001, 'FIND_USER_FAILED'>> {
		const column = identity.includes('@') ? users.email : users.username;

		return fromPromise(this.db.select().from(users).where(eq(column, identity)), (error) =>
			this.error(3001, 'FIND_USER_FAILED', error)
		).map(([user]) => user ?? null);
	}

	/** All admin users, oldest first. */
	list(): ResultAsync<UserSummary[], ServiceError<3005, 'LIST_USERS_FAILED'>> {
		return fromPromise(
			this.db
				.select({
					id: users.id,
					username: users.username,
					email: users.email,
					createdAt: users.createdAt
				})
				.from(users)
				.orderBy(asc(users.createdAt)),
			(error) => this.error(3005, 'LIST_USERS_FAILED', error)
		);
	}

	/** Creates a user; the username and the email address must not be in use yet. */
	create(
		input: CreateUserInput
	): ResultAsync<
		User,
		| ServiceError<3001, 'FIND_USER_FAILED'>
		| ServiceError<3002, 'CREATE_USER_FAILED'>
		| ServiceError<3003, 'USERNAME_TAKEN'>
		| ServiceError<3004, 'EMAIL_TAKEN'>
	> {
		return fromPromise(
			this.db
				.select({ username: users.username, email: users.email })
				.from(users)
				.where(or(eq(users.username, input.username), eq(users.email, input.email))),
			(error) => this.error(3001, 'FIND_USER_FAILED', error)
		)
			.andThen((existing) => {
				if (existing.some((user) => user.username === input.username)) {
					return errAsync(this.error(3003, 'USERNAME_TAKEN'));
				}

				if (existing.some((user) => user.email === input.email)) {
					return errAsync(this.error(3004, 'EMAIL_TAKEN'));
				}

				return okAsync(undefined);
			})
			.andThen(() =>
				fromPromise(
					(async () => {
						const [user] = await this.db
							.insert(users)
							.values({
								username: input.username,
								email: input.email,
								passwordHash: await hashPassword(input.password)
							})
							.returning();

						return user;
					})(),
					(error) => this.error(3002, 'CREATE_USER_FAILED', error)
				)
			);
	}
}
