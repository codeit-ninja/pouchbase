import type { RequestHandler } from './$types';

import { passwordSignInSchema } from '#lib/schemas/password-auth.js';
import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/**
 * Signs an app user in with a username or email, and a password.
 * Body: `{ "identity", "password" }` → `{ token, user_id }`; `username` is accepted instead of
 * `identity`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await readJsonObject(request);
	const parsed = passwordSignInSchema.safeParse(
		body && { identity: body.identity ?? body.username, password: body.password }
	);

	if (!parsed.success) {
		return json({ message: 'Send a JSON body with `identity` and `password`' }, 400);
	}

	const result = await locals.services
		.auth()
		.passwordSignIn(parsed.data.identity, parsed.data.password);

	if (result.isErr()) {
		switch (result.error.code) {
			case 11020:
				return json({ message: 'Username & password sign-in is not enabled' }, 403);
			case 11022:
				return json({ message: 'Invalid username, email or password' }, 401);
			default:
				return json({ message: 'Could not sign in' }, 500);
		}
	}

	return json({ token: result.value.token, user_id: result.value.userId });
};

export const OPTIONS: RequestHandler = preflight;
