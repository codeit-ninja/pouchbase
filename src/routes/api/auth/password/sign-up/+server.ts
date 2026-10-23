import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/**
 * Creates an app user with a username and password.
 * Body: `{ "username", "password", "email"?, "name"? }` → `{ token, user_id }`.
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const body = await readJsonObject(request);

	if (!body) {
		return json({ message: 'Send a JSON body' }, 400);
	}

	const result = await locals.services.auth().passwordSignUp({
		username: String(body.username ?? ''),
		password: String(body.password ?? ''),
		email: body.email === undefined ? undefined : String(body.email),
		name: body.name === undefined ? undefined : String(body.name)
	});

	if (result.isErr()) {
		switch (result.error.code) {
			case 11020:
				return json({ message: 'Username & password sign-in is not enabled' }, 403);
			case 11021:
				return json({ message: 'Sign-up is not allowed' }, 403);
			case 11023:
				return json(
					{ message: 'Invalid input', issues: { username: 'This username is already taken' } },
					409
				);
			case 11024:
				return json(
					{ message: 'Invalid input', issues: { email: 'This email address is already in use' } },
					409
				);
			case 11025:
				return json({ message: 'Invalid input', issues: result.error.data.issues }, 400);
			default:
				return json({ message: 'Could not sign up' }, 500);
		}
	}

	const email = typeof body.email === 'string' ? body.email.trim() : '';

	// Sends the verification email in the background, when mail is set up; the sign-up doesn't wait.
	if (email) {
		const verification = locals.services
			.auth()
			.requestVerification(email)
			.mapErr((failure) => {
				if (failure.code !== 11027) {
					console.error('[pouchbase] Could not send the verification email', failure);
				}
			});

		platform?.ctx?.waitUntil(Promise.resolve(verification));
	}

	return json({ token: result.value.token, user_id: result.value.userId });
};

export const OPTIONS: RequestHandler = preflight;
