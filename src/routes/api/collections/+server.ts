import type { RequestHandler } from './$types';

import { json, preflight, requestServiceKey } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';
import { apiCreateCollectionSchema } from '#lib/schemas/collections.js';

import { errorResponse, invalidBody, PURPOSE } from './responses';

/**
 * The collections API manages the schema: collections, their fields, indexes and API rules. It
 * needs an API key with the `service` scope (`Authorization: Bearer pbk_…`).
 */

/** Every collection with its fields, indexes, API rules and settings → `{ items }`. */
export const GET: RequestHandler = async (event) => {
	const auth = await requestServiceKey(event, PURPOSE);

	if ('response' in auth) {
		return auth.response;
	}

	const result = await event.locals.services.collections().schemas();

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not list the collections');
	}

	return json({ items: result.value });
};

/**
 * Creates a collection. Body: `{ name, fields?, indexes?, rules?, thumbnails? }` → `201` with the
 * collection.
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requestServiceKey(event, PURPOSE);

	if ('response' in auth) {
		return auth.response;
	}

	const parsed = apiCreateCollectionSchema.safeParse(await readJsonObject(event.request));

	if (!parsed.success) {
		return invalidBody(
			'Send a JSON body with `name` and optionally `fields`, `indexes` and `rules`',
			parsed.error
		);
	}

	const result = await event.locals.services.collections().createFromApi(parsed.data);

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not create the collection');
	}

	return json(result.value, 201);
};

export const OPTIONS: RequestHandler = preflight;
