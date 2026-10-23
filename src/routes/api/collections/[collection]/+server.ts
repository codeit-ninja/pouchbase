import type { RequestHandler } from './$types';

import { json, noContent, preflight, requestServiceKey } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';
import { apiUpdateCollectionSchema } from '#lib/schemas/collections.js';

import { errorResponse, flag, invalidBody, PURPOSE } from '../responses';

/** One collection with its fields, indexes, API rules and settings. */
export const GET: RequestHandler = async (event) => {
	const auth = await requestServiceKey(event, PURPOSE);

	if ('response' in auth) {
		return auth.response;
	}

	const result = await event.locals.services.collections().schema(event.params.collection);

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not read the collection');
	}

	if (!result.value) {
		return json({ message: 'Collection not found' }, 404);
	}

	return json(result.value);
};

/**
 * Changes a collection. Body: `{ name?, fields?, indexes?, rules?, thumbnails? }`; only the given
 * parts change. `fields` and `indexes` are the whole list: fields matched by `id` or else by name
 * change, the others are added, and the ones left out are deleted. Changes that delete fields or
 * data need `?force=true` (`409` with the plan otherwise) → the collection.
 */
export const PATCH: RequestHandler = async (event) => {
	const auth = await requestServiceKey(event, PURPOSE);

	if ('response' in auth) {
		return auth.response;
	}

	const parsed = apiUpdateCollectionSchema.safeParse(await readJsonObject(event.request));

	if (!parsed.success) {
		return invalidBody(
			'Send a JSON body with `name`, `fields`, `indexes`, `rules` or `thumbnails`',
			parsed.error
		);
	}

	const result = await event.locals.services
		.collections()
		.updateFromApi(event.params.collection, parsed.data, flag(event.url, 'force'));

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not update the collection');
	}

	return json(result.value);
};

/** Deletes a collection and its records → `204`. */
export const DELETE: RequestHandler = async (event) => {
	const auth = await requestServiceKey(event, PURPOSE);

	if ('response' in auth) {
		return auth.response;
	}

	const result = await event.locals.services.collections().delete(event.params.collection);

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not delete the collection');
	}

	return noContent();
};

export const OPTIONS: RequestHandler = preflight;
