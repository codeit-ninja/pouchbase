import type { RequestHandler } from './$types';

import { error } from '@sveltejs/kit';

/**
 * The modules and assets of a release (`GET /update/files?version=0.5.0`), passed through from
 * GitHub as they come, for the update dialog of a Worker.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const version = url.searchParams.get('version') ?? '';

	if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
		error(400, 'Invalid version');
	}

	const result = await locals.services.updates().workerFiles(version);

	if (result.isErr()) {
		error(502, `Could not download the update: ${result.error.data.reason}`);
	}

	return new Response(result.value.body, {
		headers: { 'content-type': 'application/gzip', 'cache-control': 'no-store' }
	});
};
