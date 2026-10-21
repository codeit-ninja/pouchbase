import type { RequestHandler } from './$types';

import { passwordSignInSchema } from '#lib/schemas/password-auth.js';
import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/**
 * Signs an app user in with a username and password.
 * Body: `{ "username", "password" }` → `{ token, user_id }`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = passwordSignInSchema.safeParse(await readJsonObject(request));

	if (!parsed.success) {
		return json({ message: 'Send a JSON body with `username` and `password`' }, 400);
	}

	const result = await locals.services
		.auth()
		.passwordSignIn(parsed.data.username, parsed.data.password);

	if (result.isErr()) {
		switch (result.error.code) {
			case 11020:
				return json({ message: 'Username & password sign-in is not enabled' }, 403);
			case 11022:
				return json({ message: 'Invalid username or password' }, 401);
			default:
				return json({ message: 'Could not sign in' }, 500);
		}
	}

	return json({ token: result.value.token, user_id: result.value.userId });
};

export const OPTIONS: RequestHandler = preflight;
