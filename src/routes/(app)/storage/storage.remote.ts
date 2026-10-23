import { error, invalid } from '@sveltejs/kit';

import { command, form, getRequestEvent, query } from '$app/server';

import { storageSettingsSchema } from '#lib/schemas/storage.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** Where uploaded files are stored. The S3 secret key is never included. */
export const getStorageSettings = query(async () => {
	const { services } = requireUser();

	const result = await services.storage().settings();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const updateStorageSettings = form(storageSettingsSchema, async (data, issue) => {
	const { services } = requireUser();

	if (data.provider === 's3' && !data._secretAccessKey) {
		const current = await services.storage().settings();

		if (current.isOk() && !current.value.hasSecretAccessKey) {
			invalid(issue._secretAccessKey('Enter the secret access key'));
		}
	}

	const result = await services.storage().update({
		provider: data.provider,
		endpoint: data.endpoint,
		region: data.region,
		bucket: data.bucket,
		accessKeyId: data.accessKeyId,
		secretAccessKey: data._secretAccessKey,
		pathStyle: data.pathStyle
	});

	if (result.isErr()) {
		if (result.error.code === 12005) {
			invalid('Finish or skip moving the files to the current storage first');
		}

		if (result.error.code === 12004) {
			invalid(`Could not write to the bucket: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getStorageSettings().refresh();
	void getStorageMigration().refresh();

	return { saved: true };
});

/** Files that are still in the previous storage after a switch, or `null`. */
export const getStorageMigration = query(async () => {
	const { services } = requireUser();

	const result = await services.storage().migration();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** Copies the next few files to the current storage; call it until `finished`. */
export const migrateStorage = command(async () => {
	const { services } = requireUser();

	const result = await services.storage().migrateNext();

	if (result.isErr()) {
		if (result.error.code === 12006) {
			error(502, `Could not copy a file: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return result.value;
});

export const skipStorageMigration = form(async () => {
	const { services } = requireUser();

	const result = await services.storage().skipMigration();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getStorageMigration().refresh();

	return { skipped: true };
});
