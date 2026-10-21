import type { RequestHandler } from './$types';

import { redirect } from '@sveltejs/kit';

import { isOAuthProvider } from '#lib/auth/oauth-providers.js';
import { json } from '#lib/server/api.js';

/**
 * Starts an OAuth sign-in, opened by the app in a popup:
 * `/api/auth/oauth2/<provider>?state=<random>&challenge=<S256 of a secret verifier>`.
 * The app then polls `POST /api/auth/oauth2/result` with the state and verifier.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const { provider } = params;

	if (!isOAuthProvider(provider)) {
		return json({ message: 'Unknown provider' }, 404);
	}

	const result = await locals.services
		.auth()
		.startOAuth(
			provider,
			url.searchParams.get('state') ?? '',
			url.searchParams.get('challenge') ?? ''
		);

	if (result.isErr()) {
		switch (result.error.code) {
			case 11001:
				return json({ message: 'This provider is not enabled' }, 400);
			case 11010:
				return json({ message: 'Pass a unique `state` and an S256 PKCE `challenge`' }, 400);
			default:
				return json({ message: 'Could not start the sign-in' }, 500);
		}
	}

	redirect(302, result.value);
};
