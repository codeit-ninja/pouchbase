import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { command, form, getRequestEvent, query } from '$app/server';

import {
	backupDestinationSchema,
	backupScheduleSchema,
	createBackupSchema,
	idSchema,
	restoreBackupSchema
} from '#lib/schemas/backups.js';

/** How long one call of `advanceBackups` may run steps, so the page shows progress regularly. */
const STEP_BUDGET = 8 * 1000;

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** Destinations, schedules, backups and the latest restore. Secret keys are never included. */
export const getBackups = query(async () => {
	const { services } = requireUser();
	const backups = services.backups();

	const [destinations, schedules, list, restore] = await Promise.all([
		backups.destinations(),
		backups.schedules(),
		backups.list(),
		backups.latestRestore()
	]);

	if (destinations.isErr()) {
		error(500, destinations.error.message);
	}

	if (schedules.isErr()) {
		error(500, schedules.error.message);
	}

	if (list.isErr()) {
		error(500, list.error.message);
	}

	if (restore.isErr()) {
		error(500, restore.error.message);
	}

	return {
		destinations: destinations.value,
		schedules: schedules.value,
		backups: list.value,
		restore: restore.value
	};
});

export const saveBackupDestination = form(backupDestinationSchema, async (data, issue) => {
	const { services } = requireUser();

	if (!data.id && !data._secretAccessKey) {
		invalid(issue._secretAccessKey('Enter the secret access key'));
	}

	const result = await services.backups().saveDestination({
		id: data.id,
		name: data.name,
		endpoint: data.endpoint,
		region: data.region,
		bucket: data.bucket,
		accessKeyId: data.accessKeyId,
		secretAccessKey: data._secretAccessKey,
		pathStyle: data.pathStyle,
		prefix: data.prefix
	});

	if (result.isErr()) {
		if (result.error.code === 16001) {
			error(404, 'Destination not found');
		}

		if (result.error.code === 16002) {
			invalid(`Could not write to the bucket: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { saved: true };
});

export const deleteBackupDestination = form(idSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.backups().deleteDestination(data.id);

	if (result.isErr()) {
		if (result.error.code === 16003) {
			invalid('Wait until the running backup or restore has finished');
		}

		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { deleted: true };
});

/** Adds the backups in a destination that aren't listed yet; returns how many were added. */
export const discoverBackups = command(z.string(), async (id) => {
	const { services } = requireUser();
	let added = 0;

	// A call adds a limited number at a time.
	for (;;) {
		const result = await services.backups().discover(id);

		if (result.isErr()) {
			if (result.error.code === 16001) {
				error(404, 'Destination not found');
			}

			if (result.error.code === 16007) {
				error(502, `Could not read the bucket: ${result.error.data.reason}`);
			}

			error(500, result.error.message);
		}

		added += result.value;

		if (result.value === 0 || added >= 200) {
			break;
		}
	}

	void getBackups().refresh();

	return { added };
});

export const saveBackupSchedule = form(backupScheduleSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.backups().saveSchedule({
		id: data.id,
		destinationId: data.destinationId,
		cron: data.frequency === 'custom' ? data.cron : data.frequency,
		includeFiles: data.includeFiles,
		keep: data.keep,
		enabled: data.enabled
	});

	if (result.isErr()) {
		if (result.error.code === 16001) {
			invalid(issue.destinationId('Choose a destination'));
		}

		if (result.error.code === 16008) {
			invalid(issue.cron('This schedule never runs'));
		}

		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { saved: true };
});

export const deleteBackupSchedule = form(idSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.backups().deleteSchedule(data.id);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { deleted: true };
});

export const startBackup = form(createBackupSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.backups().start(data.destinationId, data.includeFiles);

	if (result.isErr()) {
		if (result.error.code === 16001) {
			invalid(issue.destinationId('Choose a destination'));
		}

		if (result.error.code === 16003) {
			invalid('Wait until the running restore has finished');
		}

		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { id: result.value };
});

export const deleteBackup = form(idSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.backups().delete(data.id);

	if (result.isErr()) {
		if (result.error.code === 16003) {
			invalid('A running backup can’t be deleted');
		}

		if (result.error.code === 16004) {
			error(404, 'Backup not found');
		}

		if (result.error.code === 16006) {
			invalid(`Could not delete the backup: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { deleted: true };
});

export const restoreBackup = form(restoreBackupSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.backups().restore(data.backupId, data.includeFiles);

	if (result.isErr()) {
		if (result.error.code === 16003) {
			invalid('Wait until the running backup or restore has finished');
		}

		if (result.error.code === 16004) {
			error(404, 'Backup not found');
		}

		if (result.error.code === 16005) {
			invalid('Only completed backups can be restored');
		}

		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { id: result.value };
});

/**
 * Starts uploading a downloaded backup with the manifest from its archive; the page then sends
 * the database files to `/backups/<id>/upload`. Returns the id of the new backup.
 */
export const startBackupUpload = command(
	z.object({ destinationId: z.string().min(1), manifest: z.unknown() }),
	async ({ destinationId, manifest }) => {
		const { services } = requireUser();

		const result = await services.backups().startUpload(destinationId, manifest);

		if (result.isErr()) {
			if (result.error.code === 16001) {
				error(404, 'Destination not found');
			}

			if (result.error.code === 16010) {
				error(400, 'This is not a Pouchbase backup: its manifest.json is missing or invalid');
			}

			error(500, result.error.message);
		}

		return { id: result.value };
	}
);

/** Completes an upload once its database files are sent; it can be restored then. */
export const finishBackupUpload = command(z.string(), async (id) => {
	const { services } = requireUser();

	const result = await services.backups().finishUpload(id);

	if (result.isErr()) {
		if (result.error.code === 16004) {
			error(404, 'Backup not found');
		}

		if (result.error.code === 16011) {
			error(409, 'Not all files of the backup were uploaded');
		}

		if (result.error.code === 16012) {
			error(502, `Could not write to the destination: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { finished: true };
});

/** Gives up on an upload and removes what was uploaded so far. */
export const cancelBackupUpload = command(z.string(), async (id) => {
	const { services } = requireUser();

	const result = await services.backups().delete(id);

	if (result.isErr() && result.error.code !== 16004) {
		error(500, result.error.message);
	}

	void getBackups().refresh();

	return { cancelled: true };
});

/**
 * Runs steps of the running backups and restores for a few seconds; the page calls it while jobs
 * run. Scheduled work also continues without it (see `src/routes/internal/tick`).
 */
export const advanceBackups = command(async () => {
	const { services } = requireUser();

	const result = await services.backups().advance(STEP_BUDGET);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});
