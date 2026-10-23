import { error } from '@sveltejs/kit';

import { form, getRequestEvent, query } from '$app/server';

function requireUser() {
	const event = getRequestEvent();

	if (!event.locals.user) {
		error(401, 'Not logged in');
	}

	return event;
}

/** The TypeScript types of every collection, and the token of `GET /api/types`. */
export const getTypes = query(async () => {
	const { locals } = requireUser();

	const [code, token] = await Promise.all([
		locals.services.types().generate(),
		locals.services.types().token()
	]);

	if (code.isErr()) {
		error(500, code.error.message);
	}

	if (token.isErr()) {
		error(500, token.error.message);
	}

	return { code: code.value, token: token.value };
});

export const regenerateTypesToken = form(async () => {
	const { locals } = requireUser();

	const result = await locals.services.types().regenerateToken();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getTypes().refresh();

	return { regenerated: true };
});
