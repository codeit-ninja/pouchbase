import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';
import { background } from '#lib/server/platform/runtime/index.js';

/**
 * Creates an app user with a name, email and password, and emails them a verification link.
 * Body: `{ "name", "email", "password" }` → `{ token, user_id, verification_required }`; `token`
 * is `null` when the user must verify their address before signing in.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await readJsonObject(request);

	if (!body) {
		return json({ message: 'Send a JSON body' }, 400);
	}

	const result = await locals.services.auth().passwordSignUp({
		name: String(body.name ?? ''),
		email: String(body.email ?? ''),
		password: String(body.password ?? '')
	});

	if (result.isErr()) {
		switch (result.error.code) {
			case 11020:
				return json({ message: 'Email & password sign-in is not enabled' }, 403);
			case 11021:
				return json({ message: 'Sign-up is not allowed' }, 403);
			case 11024:
				return json(
					{ message: 'Invalid input', issues: { email: 'This email address is already in use' } },
					409
				);
			case 11025:
				return json({ message: 'Invalid input', issues: result.error.data.issues }, 400);
			case 11027:
				return json({ message: 'Sending email is not set up' }, 503);
			default:
				return json({ message: 'Could not sign up' }, 500);
		}
	}

	const { token, userId } = result.value;

	// Sends the verification email in the background, when mail is set up; the sign-up doesn't wait.
	const verification = locals.services
		.auth()
		.requestVerification(String(body.email))
		.mapErr((failure) => {
			if (failure.code !== 11027) {
				console.error('[pouchbase] Could not send the verification email', failure);
			}
		});

	background(Promise.resolve(verification));

	return json({ token, user_id: userId, verification_required: token === null });
};

export const OPTIONS: RequestHandler = preflight;
