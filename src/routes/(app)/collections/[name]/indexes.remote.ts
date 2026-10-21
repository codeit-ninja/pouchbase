import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { form, getRequestEvent, query } from '$app/server';

import { createIndexSchema, deleteIndexSchema } from '#lib/schemas/indexes.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

export const listIndexes = query(z.string(), async (collectionName) => {
	const result = await getRequestEvent().locals.services.indexes().list(collectionName);

	if (result.isErr()) {
		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		error(500, result.error.message);
	}

	return result.value;
});

export const createIndex = form(createIndexSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services
		.indexes()
		.create(data.collection, { columns: data.columns, unique: data.unique });

	if (result.isErr()) {
		switch (result.error.code) {
			case 6006:
				error(404, 'Collection not found');
				break;
			case 9001:
				invalid(issue.columns('Choose between 1 and 8 existing columns'));
				break;
			case 9002:
				invalid("Some records share the same values, so this index can't be unique");
				break;
		}

		error(500, result.error.message);
	}

	void listIndexes(data.collection).refresh();

	return { name: result.value.name };
});

export const deleteIndex = form(deleteIndexSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.indexes().delete(data.collection, data.name);

	if (result.isErr()) {
		if (result.error.code === 6006 || result.error.code === 9004) {
			error(404, 'Index not found');
		}

		error(500, result.error.message);
	}

	void listIndexes(data.collection).refresh();
});
