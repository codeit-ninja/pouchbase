import { error, invalid } from '@sveltejs/kit';

import { form, getRequestEvent, query } from '$app/server';

import { createAdminSchema } from '#lib/schemas/admins.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** The admin users that can log in to Pouchbase. Password hashes are never included. */
export const getAdmins = query(async () => {
	const { services } = requireUser();

	const result = await services.users().list();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const createAdmin = form(createAdminSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.users().create({
		username: data.username,
		email: data.email,
		password: data._password
	});

	if (result.isErr()) {
		if (result.error.code === 3003) {
			invalid(issue.username('This username is already in use'));
		}

		if (result.error.code === 3004) {
			invalid(issue.email('This email address is already in use'));
		}

		error(500, result.error.message);
	}

	void getAdmins().refresh();

	return { created: true };
});
