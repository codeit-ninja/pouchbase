import type { RequestHandler } from './$types';

import { failureResponse, registryError, registryPreflight } from '#lib/server/registry-http.js';
import { getBundle } from '#lib/server/registry.js';

/**
 * The bundle of a version (`PluginVersion.bundleUrl`), byte for byte as its integrity says; counts
 * a download. Versions never change, so the bundle can be cached for good.
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const bundle = await getBundle(params.id, params.version);

		if (bundle === null) {
			return registryError(404, 'not_found', `No bundle for ${params.id}@${params.version}`);
		}

		return new Response(bundle, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${params.id}-${params.version}.json"`,
				'Cache-Control': 'public, max-age=31536000, immutable',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		return failureResponse(error);
	}
};

export const OPTIONS: RequestHandler = registryPreflight;
