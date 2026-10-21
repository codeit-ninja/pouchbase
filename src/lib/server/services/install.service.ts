import type { ServiceError } from './base.service';
import type { SessionUser } from './sessions.service';
import type { CreateUserInput } from './users.service';
import type { ResultAsync } from 'neverthrow';

import { errAsync, okAsync } from 'neverthrow';

import { Service } from './base.service';

export type InstallState = 'account' | 'settings' | 'done';

// A completed installation is never undone, so cache it per isolate.
let installed = false;

export class InstallService extends Service {
	/**
	 * Which step of the install wizard the app is at:
	 * no database or no users → `account`, no `installed_at` setting → `settings`, otherwise `done`.
	 */
	getState(): ResultAsync<
		InstallState,
		| ServiceError<1000, 'DATABASE_LOOKUP_FAILED'>
		| ServiceError<3000, 'HAS_USERS_FAILED'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		if (installed) {
			return okAsync('done');
		}

		return this.services
			.database()
			.exists()
			.andThen((exists) => (exists ? this.services.users().hasAny() : okAsync(false)))
			.andThen((hasUsers) => {
				if (!hasUsers) {
					return okAsync<InstallState>('account');
				}

				return this.services
					.settings()
					.get('installed_at')
					.map((installedAt): InstallState => {
						if (!installedAt) {
							return 'settings';
						}

						installed = true;
						return 'done';
					});
			});
	}

	/**
	 * Step 1: creates the system database and runs its migrations, creates the app database
	 * (random name), creates the admin account and logs it in.
	 */
	createAccount(
		input: CreateUserInput
	): ResultAsync<
		SessionUser,
		| ServiceError<1000, 'DATABASE_LOOKUP_FAILED'>
		| ServiceError<1001, 'DATABASE_CREATE_FAILED'>
		| ServiceError<1002, 'DATABASE_MIGRATION_FAILED'>
		| ServiceError<1003, 'APP_DATABASE_CREATE_FAILED'>
		| ServiceError<2000, 'ACCOUNT_ALREADY_EXISTS'>
		| ServiceError<3000, 'HAS_USERS_FAILED'>
		| ServiceError<3002, 'CREATE_USER_FAILED'>
		| ServiceError<4000, 'CREATE_SESSION_FAILED'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
	> {
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
					.sessions()
					.create(user.id)
					.map(() => ({ id: user.id, username: user.username, email: user.email }))
			);
	}

	/** Step 2: saves the app settings and marks the installation as complete. */
	complete(
		appName: string
	): ResultAsync<
		void,
		| ServiceError<1000, 'DATABASE_LOOKUP_FAILED'>
		| ServiceError<2001, 'STEP_NOT_AVAILABLE'>
		| ServiceError<3000, 'HAS_USERS_FAILED'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<5001, 'SET_SETTING_FAILED'>
	> {
		return this.getState()
			.andThen((state) =>
				state === 'settings' ? okAsync(undefined) : errAsync(this.error(2001, 'STEP_NOT_AVAILABLE'))
			)
			.andThen(() => this.services.settings().set('app_name', appName))
			.andThen(() => this.services.settings().set('installed_at', new Date().toISOString()));
	}
}
