import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/** Sets a new password with the token from the reset email. Body: `{ "token", "password" }`. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await readJsonObject(request);

	if (typeof body?.token !== 'string' || typeof body.password !== 'string') {
		return json({ message: 'Send a JSON body with `token` and `password`' }, 400);
	}

	const result = await locals.services.auth().confirmPasswordReset(body.token, body.password);

	if (result.isErr()) {
		switch (result.error.code) {
			case 11025:
				return json({ message: 'Invalid input', issues: result.error.data.issues }, 400);
			case 11028:
				return json({ message: 'The link is invalid or has expired' }, 400);
			default:
				return json({ message: 'Could not reset the password' }, 500);
		}
	}

	return json({ reset: true });
};

export const OPTIONS: RequestHandler = preflight;
