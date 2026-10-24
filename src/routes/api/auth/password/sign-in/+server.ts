import type { RequestHandler } from './$types';

import { passwordSignInSchema } from '#lib/schemas/password-auth.js';
import { json, preflight } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

/**
 * Signs an app user in with an email and a password.
 * Body: `{ "email", "password" }` → `{ token, user_id }`; `identity` is accepted instead of
 * `email`, for older SDKs.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await readJsonObject(request);
	const parsed = passwordSignInSchema.safeParse(
		body && { email: body.email ?? body.identity, password: body.password }
	);

	if (!parsed.success) {
		return json({ message: 'Send a JSON body with `email` and `password`' }, 400);
	}

	const result = await locals.services
		.auth()
		.passwordSignIn(parsed.data.email, parsed.data.password);

	if (result.isErr()) {
		switch (result.error.code) {
			case 11020:
				return json({ message: 'Email & password sign-in is not enabled' }, 403);
			case 11022:
				return json({ message: 'Invalid email or password' }, 401);
			case 11032:
				return json(
					{ message: 'Verify your email address first', code: 'email_not_verified' },
					403
				);
			default:
				return json({ message: 'Could not sign in' }, 500);
		}
	}

	return json({ token: result.value.token, user_id: result.value.userId });
};

export const OPTIONS: RequestHandler = preflight;
