import { error, invalid, redirect } from '@sveltejs/kit';
import { z } from 'zod';

import { form, getRequestEvent, query } from '$app/server';

import {
	createCollectionSchema,
	deleteCollectionSchema,
	renameCollectionSchema
} from '#lib/schemas/collections.js';

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
