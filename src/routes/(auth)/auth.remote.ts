import { error, invalid, redirect } from '@sveltejs/kit';

import { form, getRequestEvent, query } from '$app/server';

import { loginSchema } from '#lib/schemas/auth.js';

export const login = form(loginSchema, async (data) => {
	const { locals } = getRequestEvent();

	const result = await locals.services.sessions().login(data.username, data._password);

	if (result.isErr()) {
		if (result.error.code === 4003) {
			invalid('Invalid username or password');
		}

		error(500, result.error.message);
	}

	redirect(303, '/');
});

export const logout = form(async () => {
	const { locals } = getRequestEvent();

	const result = await locals.services.sessions().invalidate();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	redirect(303, '/login');
});

export const currentUser = query(() => getRequestEvent().locals.user);
