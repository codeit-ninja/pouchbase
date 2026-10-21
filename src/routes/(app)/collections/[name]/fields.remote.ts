import { error, invalid } from '@sveltejs/kit';

import { form, getRequestEvent } from '$app/server';

import { createFieldSchema, deleteFieldSchema, renameFieldSchema } from '#lib/schemas/fields.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

export const createField = form(createFieldSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.fields().create(data.collection, {
		name: data.name,
		type: data.type,
		required: data.required,
		unique: data.unique,
		defaultValue: data.defaultValue,
		options: {
			format: data.format,
			collectionId: data.relationCollection,
			multiple: data.multiple
		}
	});

	if (result.isErr()) {
		switch (result.error.code) {
			case 6006:
				error(404, 'Collection not found');
				break;
			case 7001:
				invalid(issue.name('This name is not allowed'));
				break;
			case 7002:
				invalid(issue.name('A field with this name already exists'));
				break;
			case 7003:
				invalid(issue.defaultValue('This default value is not valid for the type'));
				break;
			case 7009:
				invalid(issue.relationCollection('Choose an existing collection'));
				break;
			case 7004:
				// Usually a unique index on a column that already has duplicate values.
				invalid('The field could not be added to the table');
				break;
		}

		error(500, result.error.message);
	}

	// No explicit refresh: the default invalidation also updates the records grid.
	return { name: result.value.name };
});

export const renameField = form(renameFieldSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.fields().rename(data.collection, data.name, data.newName);

	if (result.isErr()) {
		switch (result.error.code) {
			case 6006:
			case 7006:
				error(404, 'Field not found');
				break;
			case 7001:
				invalid(issue.newName('This name is not allowed'));
				break;
			case 7002:
				invalid(issue.newName('A field with this name already exists'));
				break;
		}

		error(500, result.error.message);
	}

	// No explicit refresh: the default invalidation also updates the records grid.
	return { name: result.value.name };
});

export const deleteField = form(deleteFieldSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.fields().delete(data.collection, data.name);

	if (result.isErr()) {
		if (result.error.code === 6006 || result.error.code === 7006) {
			error(404, 'Field not found');
		}

		error(500, result.error.message);
	}
});
