import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/** Marks the user as verified with the token from the verification email. Body: `{ "token" }`. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await readJsonObject(request);

	if (typeof body?.token !== 'string') {
		return json({ message: 'Send a JSON body with `token`' }, 400);
	}

	const result = await locals.services.auth().confirmVerification(body.token);

	if (result.isErr()) {
		if (result.error.code === 11029) {
			return json({ message: 'The link is invalid or has expired' }, 400);
		}

		return json({ message: 'Could not verify the email address' }, 500);
	}

	return json({ verified: true });
};

export const OPTIONS: RequestHandler = preflight;
