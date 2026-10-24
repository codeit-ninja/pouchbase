import type { RequestHandler } from './$types';

import { json } from '#lib/server/api.js';

/**
 * An image of a plugin (`ui/*.svg`), e.g. a sign-in provider's logo for a sign-in button. Public,
 * like the plugin itself in the registry. SVG can carry scripts, so it is served sandboxed: no
 * scripts, no requests, and never sniffed as another type.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const result = await locals.services.plugins().asset(params.id, params.path);

	if (result.isErr()) {
		return json({ message: 'Could not load the file' }, 500);
	}

	if (!result.value) {
		return json({ message: 'File not found' }, 404);
	}

	return new Response(result.value.content, {
		headers: {
			'Content-Type': result.value.contentType,
			'Cache-Control': 'public, max-age=3600',
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
			'X-Content-Type-Options': 'nosniff',
			'Access-Control-Allow-Origin': '*',
			'Cross-Origin-Resource-Policy': 'cross-origin'
		}
	});
};
