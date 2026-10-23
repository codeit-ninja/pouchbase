import type { RequestHandler } from './$types';

import { json, preflight, requestAccess } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';

import { errorResponse, readOptions } from './responses';

const MAX_PER_PAGE = 500;

/** A positive whole number from the query, `fallback` when missing, `null` when invalid. */
function positiveInteger(value: string | null, fallback: number) {
	if (value === null || value === '') {
		return fallback;
	}

	const number = Number(value);

	return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/**
 * Lists the records of a collection that its list rule allows.
 * Query: `page` (default 1), `perPage` (default 30, at most 500), `sort` (`-created_at,title`),
 * `filter` (`status = "published" && views > 10`), `fields` (`id,title`) and `expand`
 * (`author,comments.author`: relation fields to replace by their records) → `{ page, perPage,
 * totalItems, totalPages, items }`.
 */
export const GET: RequestHandler = async (event) => {
	const { params, url, locals } = event;
	const page = positiveInteger(url.searchParams.get('page'), 1);
	const perPage = positiveInteger(url.searchParams.get('perPage'), 30);

	if (page === null || perPage === null || perPage > MAX_PER_PAGE) {
		return json(
			{ message: `\`page\` must be 1 or more and \`perPage\` between 1 and ${MAX_PER_PAGE}` },
			400
		);
	}

	const caller = await requestAccess(event);

	if ('response' in caller) {
		return caller.response;
	}

	const result = await locals.services.records().apiList(
		params.collection,
		{
			page,
			perPage,
			sort: url.searchParams.get('sort') ?? undefined,
			filter: url.searchParams.get('filter') ?? undefined,
			...readOptions(url)
		},
		caller.access
	);

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not list the records');
	}

	return json(result.value);
};

/**
 * Creates a record when the collection's create rule allows it. Body: a JSON object with a value
 * per field → the new record (only `?fields=` when given, with the relations in `?expand=`
 * replaced by their records). Fields that are left out get their default value.
 */
export const POST: RequestHandler = async (event) => {
	const { params, request, url, locals } = event;
	const body = await readJsonObject(request);

	if (!body) {
		return json({ message: 'Send a JSON object with a value per field' }, 400);
	}

	const caller = await requestAccess(event);

	if ('response' in caller) {
		return caller.response;
	}

	const result = await locals.services
		.records()
		.apiCreate(params.collection, body, caller.access, readOptions(url));

	if (result.isErr()) {
		return errorResponse(result.error, 'Could not create the record');
	}

	return json(result.value);
};

export const OPTIONS: RequestHandler = preflight;
