import type { RequestHandler } from './$types';

import { json, noContent, preflight, requestUser } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

import { errorResponse, requestedFields } from '../responses';

/** One record (only `?fields=` when given), when the view rule allows it; otherwise `404`. */
export const GET: RequestHandler = async (event) => {
	const { params, url, locals } = event;
	const caller = await requestUser(event);

	if ('response' in caller) {
		return caller.response;
	}

	const result = await locals.services.records().apiGet(params.collection, params.id, {
		access: { auth: caller.user },
		fields: requestedFields(url)
	});

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not load the record');
	}

	if (!result.value) {
		return json({ message: 'Record not found' }, 404);
	}

	return json(result.value);
};

/**
 * Changes the fields in the JSON body of a record, when the collection's update rule allows it
 * (otherwise `404`) → the updated record. Fields that are left out keep their value.
 */
export const PATCH: RequestHandler = async (event) => {
	const { params, request, url, locals } = event;
	const body = await readJsonObject(request);

	if (!body) {
		return json({ message: 'Send a JSON object with the fields to change' }, 400);
	}

	const caller = await requestUser(event);

	if ('response' in caller) {
		return caller.response;
	}

	const result = await locals.services
		.records()
		.apiUpdate(params.collection, params.id, body, { auth: caller.user }, requestedFields(url));

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not update the record');
	}

	return json(result.value);
};

/** Deletes a record when the collection's delete rule allows it (otherwise `404`) → `204`. */
export const DELETE: RequestHandler = async (event) => {
	const { params, locals } = event;
	const caller = await requestUser(event);

	if ('response' in caller) {
		return caller.response;
	}

	const result = await locals.services
		.records()
		.delete(params.collection, [params.id], { access: { auth: caller.user } });

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not delete the record');
	}

	if (!result.value.deleted) {
		return json({ message: 'Record not found' }, 404);
	}

	return noContent();
};

export const OPTIONS: RequestHandler = preflight;
