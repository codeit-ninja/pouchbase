import { error, invalid, redirect } from '@sveltejs/kit';
import { z } from 'zod';

import { command, form, getRequestEvent, query } from '$app/server';

import {
	collectionExportSchema,
	createCollectionSchema,
	deleteCollectionSchema,
	renameCollectionSchema
} from '#lib/schemas/collections.js';

const importSchema = z.object({
	file: collectionExportSchema,
	removeMissing: z.boolean(),
	force: z.boolean(),
	dryRun: z.boolean()
});

export const listCollections = query(async () => {
	const result = await getRequestEvent().locals.services.collections().list();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	// Built-in collections (like `users`) first.
	return result.value
		.map(({ id, name, system }) => ({ id, name, system }))
		.sort((a, b) => Number(b.system) - Number(a.system));
});

export const getCollection = query(z.string(), async (name) => {
	const result = await getRequestEvent().locals.services.collections().getByName(name);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	if (!result.value) {
		error(404, 'Collection not found');
	}

	const { id, system, createdAt } = result.value;

	return { id, name: result.value.name, system, createdAt };
});

export const createCollection = form(createCollectionSchema, async (data, issue) => {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const result = await locals.services.collections().create(data.name);

	if (result.isErr()) {
		if (result.error.code === 6002) {
			invalid(issue.name('This name is not allowed'));
		}

		if (result.error.code === 6003) {
			invalid(issue.name('A collection with this name already exists'));
		}

		error(500, result.error.message);
	}

	void listCollections().refresh();

	return { name: result.value.name };
});

export const renameCollection = form(renameCollectionSchema, async (data, issue) => {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const result = await locals.services.collections().rename(data.name, data.newName);

	if (result.isErr()) {
		if (result.error.code === 6002) {
			invalid(issue.newName('This name is not allowed'));
		}

		if (result.error.code === 6003) {
			invalid(issue.newName('A collection with this name already exists'));
		}

		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		error(500, result.error.message);
	}

	void listCollections().refresh();

	return { name: result.value.name };
});

export const deleteCollection = form(deleteCollectionSchema, async (data) => {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const result = await locals.services.collections().delete(data.name);

	if (result.isErr()) {
		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		if (result.error.code === 6009) {
			invalid(
				'Other collections have relation fields that point to this collection. Delete those fields first.'
			);
		}

		error(500, result.error.message);
	}

	void listCollections().refresh();
	redirect(303, '/');
});

/**
 * Plans an import of an export file (`dryRun`) or runs it. The plan comes back either way, so the
 * dialog shows what changed.
 */
export const importCollections = command(importSchema, async ({ file, ...options }) => {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const result = await locals.services.collections().import(file, options);

	if (result.isErr()) {
		const failure = result.error;

		if (failure.code === 6015) {
			const names = failure.data.problems.map(
				(problem) => `${problem.collection}.${problem.field}`
			);

			error(
				422,
				`Relation fields point at collections this instance doesn't have: ${names.join(', ')}. Import those collections too.`
			);
		}

		if (failure.code === 6016) {
			error(400, 'Confirm that the import removes data.');
		}

		if (failure.code === 20006) {
			error(409, 'A publish, pull, backup or restore is running. Try again once it is done.');
		}

		if (failure.code === 20011) {
			// The changes before the failed one are made.
			void listCollections().refresh();
			error(422, `Stopped after ${failure.data.done} changes: ${failure.data.reason}`);
		}

		error(500, failure.message);
	}

	if (result.value.applied) {
		void listCollections().refresh();
	}

	return result.value;
});
