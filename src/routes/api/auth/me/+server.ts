import type { RequestHandler } from './$types';

import { bearerToken, json, preflight } from '#lib/server/api.js';

/** The user a `Authorization: Bearer <token>` header belongs to. */
export const GET: RequestHandler = async (event) => {
	const token = bearerToken(event);

	if (!token) {
		return json({ message: 'Missing bearer token' }, 401);
	}

	const result = await event.locals.services.auth().verifyToken(token);

	if (result.isErr()) {
		if (result.error.code === 11006 || result.error.code === 11007) {
			return json({ message: 'Invalid or expired token' }, 401);
		}

		return json({ message: 'Could not load the user' }, 500);
	}

	return json(result.value);
};

export const OPTIONS: RequestHandler = preflight;
