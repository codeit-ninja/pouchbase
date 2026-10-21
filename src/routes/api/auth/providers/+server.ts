import type { RequestHandler } from './$types';

import { OAUTH_PROVIDERS } from '#lib/auth/oauth-providers.js';
import { json, preflight } from '#lib/server/api.js';

/** The enabled OAuth providers, so client apps can show their sign-in buttons. */
export const GET: RequestHandler = async ({ locals }) => {
	const result = await locals.services.oauthProviders().list();

	if (result.isErr()) {
		return json({ message: 'Could not load providers' }, 500);
	}

	return json(
		result.value
			.filter((provider) => provider.enabled)
			.map(({ provider }) => ({ provider, label: OAUTH_PROVIDERS[provider].label }))
	);
};

export const OPTIONS: RequestHandler = preflight;
