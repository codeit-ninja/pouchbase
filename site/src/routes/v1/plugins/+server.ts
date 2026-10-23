import type { RequestHandler } from './$types';

import {
	apiVersionsOf,
	failureResponse,
	registryError,
	registryJson,
	registryPreflight
} from '#lib/server/registry-http.js';
import { searchPlugins } from '#lib/server/registry.js';

const MAX_PER_PAGE = 100;

/** A positive whole number from the query, `fallback` when missing, `null` when invalid. */
function positiveInteger(value: string | null, fallback: number) {
	if (value === null || value === '') {
		return fallback;
	}

	const number = Number(value);

	return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** `GET /v1/plugins?q=&page=&perPage=&apiVersion=` → `PluginList`, most downloaded first. */
export const GET: RequestHandler = async ({ url }) => {
	const page = positiveInteger(url.searchParams.get('page'), 1);
	const perPage = positiveInteger(url.searchParams.get('perPage'), 20);

	if (page === null || perPage === null || perPage > MAX_PER_PAGE) {
		return registryError(
			400,
			'invalid_query',
			`page must be 1 or more and perPage between 1 and ${MAX_PER_PAGE}`
		);
	}

	try {
		const list = await searchPlugins({
			query: url.searchParams.get('q') ?? undefined,
			page,
			perPage,
			apiVersions: apiVersionsOf(url)
		});

		return registryJson(list, 200, { 'Cache-Control': 'public, max-age=60' });
	} catch (error) {
		return failureResponse(error);
	}
};

export const OPTIONS: RequestHandler = registryPreflight;
