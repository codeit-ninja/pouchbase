import type { ServiceError } from './base.service';
import type { ResultAsync } from 'neverthrow';

import { asc, eq } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { hashPassword } from '../crypto';
import { users } from '../db';
import { Service } from './base.service';

export type User = typeof users.$inferSelect;

/** A user without the password hash, safe to send to the browser. */
export type UserSummary = Omit<User, 'passwordHash'>;

export type CreateUserInput = {
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

	/** Finds a user by email address. */
	findByEmail(email: string): ResultAsync<User | null, ServiceError<3001, 'FIND_USER_FAILED'>> {
		return fromPromise(this.db.select().from(users).where(eq(users.email, email)), (error) =>
			this.error(3001, 'FIND_USER_FAILED', error)
		).map(([user]) => user ?? null);
	}

	/** All admin users, oldest first. */
	list(): ResultAsync<UserSummary[], ServiceError<3005, 'LIST_USERS_FAILED'>> {
		return fromPromise(
			this.db
				.select({
					id: users.id,
					email: users.email,
					createdAt: users.createdAt
				})
				.from(users)
				.orderBy(asc(users.createdAt)),
			(error) => this.error(3005, 'LIST_USERS_FAILED', error)
		);
	}

	/** Creates a user; the email address must not be in use yet. */
	create(
		input: CreateUserInput
	): ResultAsync<
		User,
		| ServiceError<3001, 'FIND_USER_FAILED'>
		| ServiceError<3002, 'CREATE_USER_FAILED'>
		| ServiceError<3004, 'EMAIL_TAKEN'>
	> {
		return fromPromise(
			this.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)),
			(error) => this.error(3001, 'FIND_USER_FAILED', error)
		)
			.andThen((existing) => {
				if (existing.length > 0) {
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
