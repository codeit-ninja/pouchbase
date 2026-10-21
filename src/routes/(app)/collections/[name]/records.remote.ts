import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { form, getRequestEvent, query } from '$app/server';

import { USERS_COLLECTION } from '#lib/auth/users.js';
import { appPassword } from '#lib/schemas/password-auth.js';
import {
	deleteRecordsSchema,
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

/** Records of a collection to choose from in a relation field. */
export const listRelationOptions = query(z.string(), async (collectionId) => {
	const result = await getRequestEvent().locals.services.records().listOptions(collectionId);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const saveRecord = form('unchecked', async (data: SaveRecordInput, issue) => {
	const { services } = requireUser();
	const values = data.values ?? {};
	const password = data._password?.trim() ? data._password : undefined;

	// Check the password before saving, so an invalid one doesn't leave a half-saved user.
	if (password && data.collection === USERS_COLLECTION) {
		const parsed = appPassword.safeParse(password);

		if (!parsed.success) {
			invalid(issue._password(parsed.error.issues[0]?.message ?? 'Invalid password'));
		}
	}

	const result = data.id
		? await services.records().update(data.collection, data.id, values)
		: await services.records().create(data.collection, values);

	if (result.isErr()) {
		switch (result.error.code) {
			case 6006:
			case 8003:
				error(404, 'Record not found');
				break;
			case 8001:
				invalid(
					...Object.entries(result.error.data.issues).map(([field, message]) =>
						issue.values[field](message)
					)
				);
				break;
			case 8002:
				invalid(
					issue.values[result.error.data.field]('This value is already used by another record')
				);
				break;
		}

		error(500, result.error.message);
	}

	if (password && data.collection === USERS_COLLECTION) {
		const saved = await services.auth().setPassword(result.value.id, password);

		if (saved.isErr()) {
			error(500, saved.error.message);
		}
	}

	return { id: result.value.id };
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
