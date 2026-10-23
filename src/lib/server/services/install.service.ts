import type { ServiceError } from './base.service';
import type { CreateUserInput, User } from './users.service';
import type { ResultAsync } from 'neverthrow';

import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { POUCHBASE_ADMIN_EMAIL, POUCHBASE_ADMIN_PASSWORD } from '$app/env/private';

import { adminEmail, adminPassword } from '#lib/schemas/install.js';

import { Service } from './base.service';

export type InstallState = 'account' | 'done';

type InstallError =
	| ServiceError<1000, 'DATABASE_LOOKUP_FAILED'>
	| ServiceError<1001, 'DATABASE_CREATE_FAILED'>
	| ServiceError<1002, 'DATABASE_MIGRATION_FAILED'>
	| ServiceError<1003, 'APP_DATABASE_CREATE_FAILED'>
	| ServiceError<2000, 'ACCOUNT_ALREADY_EXISTS'>
	| ServiceError<3000, 'HAS_USERS_FAILED'>
	| ServiceError<3001, 'FIND_USER_FAILED'>
	| ServiceError<3002, 'CREATE_USER_FAILED'>
	| ServiceError<3004, 'EMAIL_TAKEN'>
	| ServiceError<5000, 'GET_SETTING_FAILED'>
	| ServiceError<5001, 'SET_SETTING_FAILED'>;

/** `POUCHBASE_ADMIN_EMAIL` or `POUCHBASE_ADMIN_PASSWORD` is invalid; `reason` says which and why. */
type InvalidAdminEnv = ServiceError<2002, 'INVALID_ADMIN_ENV'> & { data: { reason: string } };

// A completed installation is never undone, so cache it per isolate.
let installed = false;

/** The install from the environment that is running, so concurrent first requests share it. */
let installingFromEnv: Promise<boolean> | null = null;

export class InstallService extends Service {
	/** Whether the install wizard still has to run: no database or no users → `account`. */
	getState(): ResultAsync<
		InstallState,
		ServiceError<1000, 'DATABASE_LOOKUP_FAILED'> | ServiceError<3000, 'HAS_USERS_FAILED'>
	> {
		if (installed) {
			return okAsync('done');
		}

		return this.services
			.database()
			.exists()
			.andThen((exists) => (exists ? this.services.users().hasAny() : okAsync(false)))
			.map((hasUsers): InstallState => {
				installed = hasUsers;
				return hasUsers ? 'done' : 'account';
			});
	}

	/**
	 * Installs Pouchbase: creates the system database and runs its migrations, creates the app
	 * database (random name) and the first admin. Signing in is up to the caller.
	 */
	install(input: CreateUserInput): ResultAsync<User, InstallError> {
		return this.getState()
			.andThen((state) =>
				state === 'account'
					? okAsync(undefined)
					: errAsync(this.error(2000, 'ACCOUNT_ALREADY_EXISTS'))
			)
			.andThen(() => this.services.database().prepare())
			.andThen(() => this.services.database().createApp())
			.andThen(() => this.services.users().create(input))
			.andThen((user) =>
				this.services
					.settings()
					.set('installed_at', new Date().toISOString())
					.map(() => user)
			);
	}

	/**
	 * Installs Pouchbase without the wizard when `POUCHBASE_ADMIN_EMAIL` and
	 * `POUCHBASE_ADMIN_PASSWORD` are set and it isn't installed yet. Afterwards they are ignored.
	 * @returns Whether Pouchbase is installed now.
	 */
	installFromEnv(): ResultAsync<boolean, InstallError | InvalidAdminEnv> {
		if (!POUCHBASE_ADMIN_EMAIL || !POUCHBASE_ADMIN_PASSWORD) {
			return okAsync(false);
		}

		const email = adminEmail.safeParse(POUCHBASE_ADMIN_EMAIL);
		const password = adminPassword.safeParse(POUCHBASE_ADMIN_PASSWORD);

		if (!email.success || !password.success) {
			const variable = email.success ? 'POUCHBASE_ADMIN_PASSWORD' : 'POUCHBASE_ADMIN_EMAIL';
			const issue = (email.error ?? password.error)?.issues[0]?.message ?? 'Invalid value';

			return errAsync({
				...this.error(2002, 'INVALID_ADMIN_ENV'),
				data: { reason: `${variable}: ${issue}` }
			});
		}

		installingFromEnv ??= (async () => {
			const result = await this.install({ email: email.data, password: password.data });

			if (result.isErr()) {
				// Another isolate may have installed it in the meantime.
				if (result.error.code === 2000) {
					return true;
				}

				throw result.error;
			}

			return true;
		})().finally(() => {
			installingFromEnv = null;
		});

		return fromPromise(installingFromEnv, (error) => error as InstallError);
	}
}
