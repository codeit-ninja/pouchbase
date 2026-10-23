import type { RequestHandler } from './$types';

import { json, preflight, requestServiceKey } from '#lib/server/api.js';

import { errorResponse, PURPOSE } from '../responses';

/**
 * An export file of every collection, or of `?collections=posts,comments`: their fields, indexes,
 * API rules and settings, without records. `POST /api/collections/import` takes it.
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requestServiceKey(event, PURPOSE);

	if ('response' in auth) {
		return auth.response;
	}

	const names = event.url.searchParams
		.get('collections')
		?.split(',')
		.map((name) => name.trim())
		.filter(Boolean);

	const result = await event.locals.services.collections().export(names);

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not export the collections');
	}

	const found = new Set(result.value.collections.map((collection) => collection.name));
	const missing = names?.filter((name) => !found.has(name)) ?? [];

	if (missing.length) {
		return json({ message: `Collections not found: ${missing.join(', ')}` }, 404);
	}

	return json(result.value);
};

export const OPTIONS: RequestHandler = preflight;
