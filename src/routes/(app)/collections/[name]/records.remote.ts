import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { command, form, getRequestEvent, query, type RemoteFormInvalidField } from '$app/server';

import { USERS_COLLECTION } from '#lib/auth/users.js';
import { describeFileTypes, matchesFileTypes } from '#lib/files/accept.js';
import {
	FILES_COLLECTION,
	formatFileSize,
	MANAGED_FILE_FIELDS,
	MAX_FILE_SIZE
} from '#lib/files/files.js';
import { imageEditsSchema } from '#lib/schemas/collection-settings.js';
import { appPassword } from '#lib/schemas/password-auth.js';
import {
	deleteRecordsSchema,
	getRecordSchema,
	listRecordsSchema,
	RECORDS_PER_PAGE,
	type SaveRecordInput
} from '#lib/schemas/records.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

export const listRecords = query(listRecordsSchema, async ({ collection, page, sort, order }) => {
	const result = await getRequestEvent()
		.locals.services.records()
		.list(collection, { page, perPage: RECORDS_PER_PAGE, sort, order });

	if (result.isErr()) {
		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		error(500, result.error.message);
	}

	const { fields, ...rest } = result.value;

	return {
		...rest,
		fields: fields.map(({ id, name, type, required, unique, defaultValue, options, system }) => ({
			id,
			name,
			type,
			required,
			unique,
			defaultValue,
			options,
			system
		}))
	};
});

/** One record, e.g. a related record opened from another collection. */
export const getRecord = query(getRecordSchema, async ({ collection, id }) => {
	const result = await getRequestEvent().locals.services.records().get(collection, id);

	if (result.isErr()) {
		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		error(500, result.error.message);
	}

	return result.value;
});

/** Records of a collection to choose from in a relation field. */
export const listRelationOptions = query(z.string(), async (collectionId) => {
	const result = await getRequestEvent().locals.services.records().listOptions(collectionId);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** Turns a failed record write into form issues or an HTTP error. */
function failRecordWrite(
	failure: { code: number; message: string; data?: unknown },
	issue: RemoteFormInvalidField<SaveRecordInput>
): never {
	switch (failure.code) {
		case 6006:
		case 8003:
		case 13003:
			error(404, 'Record not found');
			break;
		case 8001:
			invalid(
				...Object.entries((failure.data as { issues: Record<string, string> }).issues).map(
					([field, message]) => issue.values[field](message)
				)
			);
			break;
		case 8002:
			invalid(
				issue.values[(failure.data as { field: string }).field](
					'This value is already used by another record'
				)
			);
			break;
		case 8012:
			invalid('Add a field to this collection first');
			break;
		case 13001:
			invalid(issue._file(`Files can be at most ${formatFileSize(MAX_FILE_SIZE)}`));
			break;
		case 13002:
			invalid(issue._file('This file is empty'));
			break;
	}

	error(500, failure.message);
}

export const saveRecord = form('unchecked', async (data: SaveRecordInput, issue) => {
	const { services } = requireUser();
	const values = data.values ?? {};

	if (data.collection === FILES_COLLECTION) {
		return saveFile(data, values, issue);
	}

	const password = data._password?.trim() ? data._password : undefined;

	// Check the password before saving, so an invalid one doesn't leave a half-saved user.
	if (password && data.collection === USERS_COLLECTION) {
		const parsed = appPassword.safeParse(password);

		if (!parsed.success) {
			invalid(issue._password(parsed.error.issues[0]?.message ?? 'Invalid password'));
		}
	}

	const uploaded = await storeUploads(data, values, issue);

	const result = data.id
		? await services.records().update(data.collection, data.id, values)
		: await services.records().create(data.collection, values);

	if (result.isErr()) {
		await removeFiles(uploaded);
		failRecordWrite(result.error, issue);
	}

	if (password && data.collection === USERS_COLLECTION) {
		const saved = await services.auth().setPassword(result.value.id, password);

		if (saved.isErr()) {
			error(500, saved.error.message);
		}
	}

	return { id: result.value.id };
});

/** Deletes files stored for a record that then failed to save, so they aren't left behind. */
async function removeFiles(ids: string[]) {
	if (ids.length) {
		await getRequestEvent().locals.services.records().delete(FILES_COLLECTION, ids);
	}
}

/**
 * Stores the files uploaded for file fields (e.g. a user's `avatar`) and single relations to
 * `files` in `files`, and points those fields at the new files in `values`.
 *
 * @returns The ids of the stored files.
 */
async function storeUploads(
	data: SaveRecordInput,
	values: NonNullable<SaveRecordInput['values']>,
	issue: RemoteFormInvalidField<SaveRecordInput>
) {
	const { services } = requireUser();
	const uploads = Object.entries(data._uploads ?? {}).filter(
		(entry): entry is [string, File] => entry[1] instanceof File && entry[1].size > 0
	);

	if (!uploads.length) {
		return [];
	}

	const fileFields = await services.records().fileFields(data.collection);

	if (fileFields.isErr()) {
		failRecordWrite(fileFields.error, issue);
	}

	const accepted = new Map(fileFields.value.map((field) => [field.name, field]));

	// Check every upload before storing any, so a wrong type or size doesn't leave files behind.
	const problems = uploads.flatMap(([name, file]) => {
		const rules = accepted.get(name);

		if (!rules) {
			return [];
		}

		if (!matchesFileTypes(rules.accept, file)) {
			return [issue._uploads[name](`Choose a file of type ${describeFileTypes(rules.accept)}`)];
		}

		if (file.size > rules.maxSize) {
			return [issue._uploads[name](`Files can be at most ${formatFileSize(rules.maxSize)}`)];
		}

		return [];
	});

	if (problems.length) {
		invalid(...problems);
	}

	const stored: string[] = [];

	for (const [name, file] of uploads) {
		if (!accepted.has(name)) {
			continue;
		}

		const result = await services.files().create(file);

		if (result.isErr()) {
			await removeFiles(stored);

			switch (result.error.code) {
				case 13001:
					invalid(issue._uploads[name](`Files can be at most ${formatFileSize(MAX_FILE_SIZE)}`));
					break;
				case 13002:
					invalid(issue._uploads[name]('This file is empty'));
					break;
			}

			error(500, result.error.message);
		}

		stored.push(result.value.id);
		values[name] = result.value.id;
	}

	return stored;
}

/**
 * Records of the built-in `files` collection: the upload goes to storage first, then the editable
 * fields (name and custom fields) are saved. `mime_type`, `size` and `key` are never taken from
 * the form.
 */
async function saveFile(
	data: SaveRecordInput,
	values: NonNullable<SaveRecordInput['values']>,
	issue: RemoteFormInvalidField<SaveRecordInput>
) {
	const { services } = requireUser();
	const file = data._file instanceof File && data._file.size ? data._file : undefined;

	if (!data.id && !file) {
		invalid(issue._file('Choose a file to upload'));
	}

	let id = data.id;

	if (file) {
		const stored = id
			? await services.files().replace(id, file)
			: await services.files().create(file, String(values.name ?? ''));

		if (stored.isErr()) {
			failRecordWrite(stored.error, issue);
		}

		id = stored.value.id;
	}

	const editable = Object.fromEntries(
		Object.entries(values).filter(
			// An empty name keeps the stored one (the uploaded file's name).
			([name, value]) => !MANAGED_FILE_FIELDS.has(name) && !(name === 'name' && value === '')
		)
	);
	const result = await services
		.records()
		.update(FILES_COLLECTION, id!, editable, { partial: true });

	if (result.isErr()) {
		failRecordWrite(result.error, issue);
	}

	return { id: result.value.id };
}

/** Edits an image of the `files` collection; the file is replaced with the result. */
export const editImage = command(imageEditsSchema, async ({ id, edits }) => {
	const { services } = requireUser();

	const result = await services.files().edit(id, edits);

	if (result.isErr()) {
		switch (result.error.code) {
			case 13003:
				error(404, 'File not found');
				break;
			case 13007:
				error(400, 'Only PNG, JPEG, GIF and WebP images can be edited');
				break;
			case 13001:
				error(400, `The edited image is larger than ${formatFileSize(MAX_FILE_SIZE)}`);
				break;
			case 13008:
				error(400, 'The image could not be edited; it may be too large');
				break;
		}

		error(500, result.error.message);
	}

	return { id };
});

export const deleteRecords = form(deleteRecordsSchema, async (data) => {
	const { services } = requireUser();

	let ids: string[];

	try {
		ids = z.array(z.string()).parse(JSON.parse(data.ids));
	} catch {
		error(400, 'Invalid selection');
	}

	const result = await services.records().delete(data.collection, ids);

	if (result.isErr()) {
		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		error(500, result.error.message);
	}

	return result.value;
});
