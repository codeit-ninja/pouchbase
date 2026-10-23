import type { RequestHandler } from './$types';

import {
	apiVersionsOf,
	failureResponse,
	registryError,
	registryJson,
	registryPreflight
} from '#lib/server/registry-http.js';
import { getVersion } from '#lib/server/registry.js';

/**
 * `GET /v1/plugins/:id/versions/:version` → `PluginVersion`, or `404`. `:version` may be `latest`:
 * the newest version, with one of the `apiVersion` query parameters when given.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const version = await getVersion(url.origin, params.id, params.version, apiVersionsOf(url));

		if (!version) {
			return registryError(404, 'not_found', `No version ${params.version} of ${params.id}`);
		}

		return registryJson(version, 200, { 'Cache-Control': 'public, max-age=60' });
	} catch (error) {
		return failureResponse(error);
	}
};

export const OPTIONS: RequestHandler = registryPreflight;
