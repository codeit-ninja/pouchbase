import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/**
 * Emails a link to verify the address. Body: `{ "email" }`. Answers the same whether or not the
 * address has an (unverified) account.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await readJsonObject(request);

	if (typeof body?.email !== 'string' || !body.email.includes('@')) {
		return json({ message: 'Send a JSON body with `email`' }, 400);
	}

	const result = await locals.services.auth().requestVerification(body.email);

	if (result.isErr()) {
		if (result.error.code === 11027) {
			return json({ message: 'Sending email is not set up' }, 503);
		}

		return json({ message: 'Could not send the email' }, 500);
	}

	return json({ sent: true });
};

export const OPTIONS: RequestHandler = preflight;
