import { error } from '@sveltejs/kit';

import { form, getRequestEvent, query } from '$app/server';

import { apiKeyIdSchema, apiKeySchema } from '#lib/schemas/api-keys.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** Every API key, newest first; the keys of functions too. */
export const getApiKeys = query(async () => {
	const { services } = requireUser();

	const result = await services.apiKeys().list();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** Creates an API key and returns it; it is shown once and can't be read back. */
export const createApiKey = form(apiKeySchema, async (data) => {
	const { services } = requireUser();

	const result = await services.apiKeys().create(data.name, data.scope);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getApiKeys().refresh();

	return { key: result.value.key };
});

export const deleteApiKey = form(apiKeyIdSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.apiKeys().delete(data.id);

	if (result.isErr()) {
		if (result.error.code === 23001) {
			error(404, 'API key not found');
		}

		if (result.error.code === 23002) {
			error(409, 'The key of a function is renewed when the function is deployed');
		}

		error(500, result.error.message);
	}

	void getApiKeys().refresh();

	return { deleted: true };
});
