import { error } from '@sveltejs/kit';

import { command, getRequestEvent, query } from '$app/server';

import { version } from '../../../package.json';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** The running version, the latest release and how this instance updates. */
export const getUpdateStatus = query(async () => {
	const { services } = requireUser();

	const result = await services.updates().status();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** Looks up the latest release on GitHub now, instead of using the answer of the last six hours. */
export const checkForUpdates = command(async () => {
	const { services } = requireUser();

	const result = await services.updates().status({ refresh: true });

	if (result.isErr()) {
		error(500, result.error.message);
	}

	getUpdateStatus().set(result.value);
});

/**
 * Starts updating the Worker: the dialog then uploads the asset buckets to `/update/assets` and
 * deploys at `/update/deploy`.
 */
export const prepareWorkerUpdate = command(async () => {
	const { services } = requireUser();

	const result = await services.updates().prepareWorker();

	if (result.isErr()) {
		if (result.error.code === 21001) {
			error(400, 'This instance does not run as a Cloudflare Worker');
		}

		if (result.error.code === 21002) {
			error(409, 'There is no newer version to install');
		}

		if (result.error.code === 21003) {
			error(502, `Could not start the update: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	// Preparing looked up the latest release again, which may be newer than the dialog shows.
	void getUpdateStatus().refresh();

	return result.value;
});

/** Replaces the single binary with the latest release; the server restarts right after. */
export const updateBinary = command(async () => {
	const { services } = requireUser();

	const result = await services.updates().updateBinary();

	if (result.isErr()) {
		if (result.error.code === 21001) {
			error(400, 'Only the single binary can update itself');
		}

		if (result.error.code === 21002) {
			error(409, 'There is no newer version to install');
		}

		error(500, result.error.data.reason);
	}

	return { version: result.value };
});

/**
 * The version of the server that answers. Polled after an update until the new version runs; a
 * command, so the answer is never cached.
 */
export const getRunningVersion = command(async () => {
	requireUser();

	return version;
});
