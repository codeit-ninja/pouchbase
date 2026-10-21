import type { ServiceError } from './base.service';
import type { ResultAsync } from 'neverthrow';

import { eq } from 'drizzle-orm';
import { fromPromise } from 'neverthrow';

import { CloudflareApiError } from '../cloudflare/d1';
import { hashPassword } from '../crypto';
import { users } from '../db';
import { Service } from './base.service';

export type User = typeof users.$inferSelect;

export type CreateUserInput = {
	username: string;
	email: string;
	password: string;
};

/** D1 reports `no such table` when the migrations haven't run yet. */
function isMissingTable(error: unknown) {
	const cause = error instanceof Error && error.cause ? error.cause : error;
	return cause instanceof CloudflareApiError && cause.message.includes('no such table');
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

	findByUsername(
		username: string
	): ResultAsync<User | null, ServiceError<3001, 'FIND_USER_FAILED'>> {
		return fromPromise(this.db.select().from(users).where(eq(users.username, username)), (error) =>
			this.error(3001, 'FIND_USER_FAILED', error)
		).map(([user]) => user ?? null);
	}

	create(input: CreateUserInput): ResultAsync<User, ServiceError<3002, 'CREATE_USER_FAILED'>> {
		return fromPromise(
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
		);
	}
}
