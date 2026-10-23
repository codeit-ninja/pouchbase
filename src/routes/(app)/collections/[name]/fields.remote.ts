import { error, invalid } from '@sveltejs/kit';

import { command, form, getRequestEvent } from '$app/server';

import {
	computeOptions,
	createFieldSchema,
	deleteFieldSchema,
	fileFieldOptions,
	listFieldOptions,
	previewComputedSchema,
	renameFieldSchema,
	updateComputedSchema,
	updateFieldSchema,
	updateFieldsSchema
} from '#lib/schemas/fields.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** Relation fields store the `id` of the records they link to, so that field must stay. */
function idInUseMessage(relations: string[]) {
	return `The id field is used by relation ${relations.length === 1 ? 'field' : 'fields'} ${relations.join(', ')}. Delete ${relations.length === 1 ? 'it' : 'them'} first.`;
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
			multiple: data.multiple,
			generator: data.idGenerator,
			defaultSql: data.defaultSql,
			...(data.type === 'computed' ? computeOptions(data) : {}),
			...(data.type === 'file' ? fileFieldOptions(data) : {}),
			...(data.type === 'list' ? listFieldOptions(data) : {})
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
				invalid(issue.relationCollection('Choose an existing collection that has an id field'));
				break;
			case 7019:
				invalid(issue.idGenerator('Choose a generator'));
				break;
			case 7022:
				invalid(issue.type('This collection already has an id field'));
				break;
			case 7023:
				invalid(issue.defaultValue(result.error.data.message));
				break;
			case 7018:
				invalid(issue.listValues('Add at least one item'));
				break;
			case 7011:
				invalid(issue.computeSource('Choose a text, number or date field of this collection'));
				break;
			case 7016:
				invalid(issue.computeScript(result.error.data.message));
				break;
			case 7004:
				// Usually a unique index on a column that already has duplicate values.
				invalid(
					data.type === 'computed' && data.unique
						? "Existing records would get the same value, so this field can't be unique"
						: 'The field could not be added to the table'
				);
				break;
		}

		error(500, result.error.message);
	}

	// No explicit refresh: the default invalidation also updates the records grid.
	return { name: result.value.name };
});

/** Saves the settings of one field from the edit-field dialog, right away. */
export const updateField = form(updateFieldSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.fields().update(data.collection, data.name, {
		defaultValue: data.defaultValue,
		options: {
			format: data.format,
			multiple: data.multiple,
			generator: data.idGenerator,
			defaultSql: data.defaultSql,
			...(data.type === 'file' ? fileFieldOptions(data) : {}),
			...(data.type === 'list' ? listFieldOptions(data) : {})
		}
	});

	if (result.isErr()) {
		switch (result.error.code) {
			case 6006:
			case 7006:
				error(404, 'Field not found');
				break;
			case 7003:
				invalid(issue.defaultValue('This default value is not valid for the type'));
				break;
			case 7010:
				error(403, "Built-in fields can't be changed");
				break;
			case 7018:
				invalid(issue.listValues('Add at least one item'));
				break;
			case 7019:
				invalid(
					data.type === 'id'
						? issue.idGenerator(
								"Auto-increment ids can't change to text ids, or the other way round"
							)
						: 'This field has no settings to change here'
				);
				break;
			case 7023:
				invalid(issue.defaultValue(result.error.data.message));
				break;
			case 7024:
				invalid(issue.multiple('Turn off Unique for this field first'));
				break;
			case 7025:
				invalid(issue.multiple('Some records have more than one value; remove them first'));
				break;
			case 7026: {
				const { items } = result.error.data;

				invalid(
					issue.listValues(
						`Records still use ${items.length === 1 ? 'this item' : 'these items'}: ${items.join(', ')}`
					)
				);
				break;
			}
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

		if (result.error.code === 7012) {
			const { computed } = result.error.data;
			const names = computed.join(', ');

			invalid(
				computed.length === 1
					? `${names} is computed from this field. Delete it first.`
					: `${names} are computed from this field. Delete them first.`
			);
		}

		if (result.error.code === 7020) {
			invalid(idInUseMessage(result.error.data.relations));
		}

		error(500, result.error.message);
	}
});

/** Changes how a computed field is calculated; every record is recalculated. */
export const updateComputedField = form(updateComputedSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services
		.fields()
		.updateComputed(data.collection, data.name, computeOptions(data));

	if (result.isErr()) {
		switch (result.error.code) {
			case 6006:
			case 7006:
				error(404, 'Field not found');
				break;
			case 7011:
				invalid(issue.computeSource('Choose a text, number or date field of this collection'));
				break;
			case 7016:
				invalid(issue.computeScript(result.error.data.message));
				break;
		}

		error(500, result.error.message);
	}

	return { name: result.value.name };
});

/** Tries a calculation on the newest records without saving anything. */
export const previewComputed = command(previewComputedSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.records().previewComputed(data.collection, computeOptions(data));

	if (result.isErr()) {
		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		error(500, result.error.message);
	}

	return result.value;
});

/** Saves the edit collection sheet: every field's settings and the display order. */
export const updateFields = form(updateFieldsSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.fields().updateAll(data.collection, data.fields);

	if (result.isErr()) {
		const index = (id: string) => data.fields.findIndex((field) => field.id === id);

		switch (result.error.code) {
			case 6006:
				error(404, 'Collection not found');
				break;
			case 7001:
				invalid(issue.fields[index(result.error.data.id)].name('This name is not allowed'));
				break;
			case 7002:
				invalid(
					issue.fields[index(result.error.data.id)].name('Another field already has this name')
				);
				break;
			case 7015: {
				const field = data.fields[index(result.error.data.id)];

				invalid(`Records share a value in ${field?.name}, so it can't be unique`);
				break;
			}
			case 7012: {
				const { computed } = result.error.data;
				const names = computed.join(', ');

				invalid(
					computed.length === 1
						? `${names} is computed from a removed field. Remove it too, or keep its source.`
						: `${names} are computed from removed fields. Remove them too, or keep their sources.`
				);
				break;
			}
			case 7020:
				invalid(idInUseMessage(result.error.data.relations));
				break;
		}

		error(500, result.error.message);
	}

	// No explicit refresh: the default invalidation also updates the records grid.
	return { saved: true };
});
