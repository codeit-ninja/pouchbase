import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';

/**
 * The enabled OAuth providers, so client apps can show their sign-in buttons: the id, the label
 * and the logo (an absolute URL, `null` when the provider's plugin has none).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const result = await locals.services.oauthProviders().list();

	if (result.isErr()) {
		return json({ message: 'Could not load providers' }, 500);
	}

	return json(
		result.value
			.filter((provider) => provider.enabled)
			.map(({ provider, label, iconUrl }) => ({
				provider,
				label,
				iconUrl: iconUrl ? new URL(iconUrl, url.origin).toString() : null
			}))
	);
};

export const OPTIONS: RequestHandler = preflight;
