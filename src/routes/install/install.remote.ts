import { error, redirect } from '@sveltejs/kit';

import { form, getRequestEvent, query } from '$app/server';

import { accountSchema, settingsSchema } from '#lib/schemas/install.js';

export const installState = query(async () => {
	const result = await getRequestEvent().locals.services.install().getState();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const createAccount = form(accountSchema, async (data) => {
	const { locals } = getRequestEvent();

	const result = await locals.services.install().createAccount({
		username: data.username,
		email: data.email,
		password: data._password
	});

	if (result.isErr()) {
		if (result.error.code === 2000) {
			error(403, 'An account has already been created');
		}

		error(500, result.error.message);
	}

	void installState().refresh();
});

export const saveSettings = form(settingsSchema, async (data) => {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const result = await locals.services.install().complete(data.appName);

	if (result.isErr()) {
		if (result.error.code === 2001) {
			error(403, 'This step is not available');
		}

		error(500, result.error.message);
	}

	redirect(303, '/');
});
