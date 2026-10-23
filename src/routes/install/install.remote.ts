import { error, redirect } from '@sveltejs/kit';

import { form, getRequestEvent } from '$app/server';

import { accountSchema } from '#lib/schemas/install.js';

export const createAccount = form(accountSchema, async (data) => {
	const { services } = getRequestEvent().locals;

	const result = await services
		.install()
		.install({ email: data.email, password: data._password })
		.andThen((user) => services.sessions().create(user.id));

	if (result.isErr()) {
		if (result.error.code === 2000) {
			error(403, 'An account has already been created');
		}

		error(500, result.error.message);
	}

	redirect(303, '/');
});
