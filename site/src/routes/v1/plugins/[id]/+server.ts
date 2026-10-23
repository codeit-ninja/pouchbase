import type { RequestHandler } from './$types';

import {
	failureResponse,
	registryError,
	registryJson,
	registryPreflight
} from '#lib/server/registry-http.js';
import { getPlugin } from '#lib/server/registry.js';

/** `GET /v1/plugins/:id` → `PluginDetails` with every version, or `404`. */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const plugin = await getPlugin(url.origin, params.id);

		if (!plugin) {
			return registryError(404, 'not_found', `No plugin ${params.id}`);
		}

		return registryJson(plugin, 200, { 'Cache-Control': 'public, max-age=60' });
	} catch (error) {
		return failureResponse(error);
	}
};

export const OPTIONS: RequestHandler = registryPreflight;
