import type { Handle } from '@sveltejs/kit/hooks';

import { SESSION_COOKIE } from '../services/sessions.service';

export const session: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);

	if (token) {
		const result = await event.locals.services.sessions().validate(token);

		// A session that can't be validated (e.g. before the database exists) counts as logged out.
		event.locals.user = result.isOk() ? result.value : null;
	}

	return resolve(event);
};
