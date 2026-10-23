import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/**
 * Emails a link to choose a new password. Body: `{ "email" }`. Answers the same whether or not the
 * address has an account, so it can't be used to find out who has one.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await readJsonObject(request);

	if (typeof body?.email !== 'string' || !body.email.includes('@')) {
		return json({ message: 'Send a JSON body with `email`' }, 400);
	}

	const result = await locals.services.auth().requestPasswordReset(body.email);

	if (result.isErr()) {
		switch (result.error.code) {
			case 11020:
				return json({ message: 'Username & password sign-in is not enabled' }, 403);
			case 11027:
				return json({ message: 'Sending email is not set up' }, 503);
			default:
				return json({ message: 'Could not send the email' }, 500);
		}
	}

	return json({ sent: true });
};

export const OPTIONS: RequestHandler = preflight;
