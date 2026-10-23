import type { RequestHandler } from './$types';

import { USERS_COLLECTION } from '#lib/auth/users.js';
import { bearerToken, json, preflight } from '#lib/server/api.js';

/** The user a `Authorization: Bearer <token>` header belongs to, as a record of `users`. */
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

	// The same shape as the records API: real booleans, parsed JSON and arrays, no blobs.
	const user = await event.locals.services
		.records()
		.apiGet(USERS_COLLECTION, String(result.value.id));

	if (user.isErr()) {
		return json({ message: 'Could not load the user' }, 500);
	}

	if (!user.value) {
		return json({ message: 'Invalid or expired token' }, 401);
	}

	return json(user.value);
};

export const OPTIONS: RequestHandler = preflight;
