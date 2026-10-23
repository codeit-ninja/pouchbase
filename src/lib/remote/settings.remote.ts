import { error } from '@sveltejs/kit';

import { getRequestEvent, query } from '$app/server';

/** Whether this instance is for development or production; `null` when it isn't set. */
export const getEnvironment = query(async () => {
	const result = await getRequestEvent().locals.services.environments().get();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});
