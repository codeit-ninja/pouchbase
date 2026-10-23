import type { RequestHandler } from './$types';

import { json, preflight, requestServiceKey } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';
import { collectionExportSchema } from '#lib/schemas/collections.js';

import { errorResponse, flag, invalidBody, planBody, PURPOSE } from '../responses';

/**
 * Imports an export file (the body): creates its collections and changes existing ones (matched
 * by id, then by name) to match it. Other collections stay, unless `?removeMissing=true`.
 * `?dryRun=true` only returns the plan; changes that delete collections, fields or data need
 * `?force=true` (`409` with the plan otherwise) → `{ applied, plan: { steps, warnings } }`.
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requestServiceKey(event, PURPOSE);

	if ('response' in auth) {
		return auth.response;
	}

	const parsed = collectionExportSchema.safeParse(await readJsonObject(event.request));

	if (!parsed.success) {
		return invalidBody(
			'Send an export file of `GET /api/collections/export` as the JSON body',
			parsed.error
		);
	}

	const { url } = event;
	const result = await event.locals.services.collections().import(parsed.data, {
		removeMissing: flag(url, 'removeMissing'),
		force: flag(url, 'force'),
		dryRun: flag(url, 'dryRun')
	});

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not import the collections');
	}

	return json({ applied: result.value.applied, plan: planBody(result.value.plan) });
};

export const OPTIONS: RequestHandler = preflight;
