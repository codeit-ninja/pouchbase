import type { RequestHandler } from './$types';

import { error, json } from '@sveltejs/kit';

import { requireDeployToken } from '#lib/server/environments.js';

/** The snapshot of this instance, for another instance that pulls from it or plans a publish. */
export const GET: RequestHandler = async (event) => {
	await requireDeployToken(event);

	const result = await event.locals.services.environments().snapshot();

	if (result.isErr()) {
		console.error('[environments] snapshot failed', result.error);
		error(500, result.error.message);
	}

	return json(result.value);
};
