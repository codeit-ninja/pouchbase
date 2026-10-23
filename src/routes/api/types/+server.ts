import type { RequestHandler } from './$types';

import { bearerToken, json, preflight, text } from '#lib/server/api.js';

/**
 * TypeScript types of every collection (`?token=…` or `Authorization: Bearer <token>`), for the
 * SDK's `pouchbase types` command. The token is shown on the API types page in the admin.
 */
export const GET: RequestHandler = async (event) => {
	const { locals, url } = event;
	const token = url.searchParams.get('token') || bearerToken(event);

	if (!token) {
		return json({ message: 'Missing token' }, 401);
	}

	const verified = await locals.services.types().verifyToken(token);

	if (verified.isErr()) {
		return json({ message: 'Could not check the token' }, 500);
	}

	if (!verified.value) {
		return json({ message: 'Invalid token' }, 401);
	}

	const result = await locals.services.types().generate();

	if (result.isErr()) {
		return json({ message: 'Could not generate the types' }, 500);
	}

	return text(result.value);
};

export const OPTIONS: RequestHandler = preflight;
