import { error } from '@sveltejs/kit';

import { getRequestEvent, query } from '$app/server';

export const getAppName = query(async () => {
	const result = await getRequestEvent().locals.services.settings().get('app_name');

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value ?? 'Pouchbase';
});
