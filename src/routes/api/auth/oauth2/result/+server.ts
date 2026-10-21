import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';

/**
 * Collects the result of a sign-in started with `/api/auth/oauth2/<provider>`.
 * Body: `{ "state": "...", "verifier": "..." }`.
 *
 * - `202 { status: "pending" }` while the user is still signing in: poll again.
 * - `200 { status: "done", token, user_id }` once; the result is deleted afterwards.
 * - `200 { status: "error", error }` with `access_denied`, `email_in_use` or `sign_in_failed`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	let body: { state?: unknown; verifier?: unknown };

	try {
		body = await request.json();
	} catch {
		return json({ message: 'Send a JSON body with `state` and `verifier`' }, 400);
	}

	const result = await locals.services
		.auth()
		.oauthResult(String(body.state ?? ''), String(body.verifier ?? ''));

	if (result.isErr()) {
		switch (result.error.code) {
			case 11011:
				return json({ message: 'Unknown or expired sign-in' }, 404);
			case 11012:
				return json({ message: 'The verifier does not match this sign-in' }, 403);
			default:
				return json({ message: 'Could not load the sign-in result' }, 500);
		}
	}

	const value = result.value;

	if (value.status === 'pending') {
		return json(value, 202);
	}

	return json(
		value.status === 'done' ? { status: 'done', token: value.token, user_id: value.userId } : value
	);
};

export const OPTIONS: RequestHandler = preflight;
