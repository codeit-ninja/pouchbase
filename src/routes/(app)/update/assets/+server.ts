import type { RequestHandler } from './$types';

import { error, json } from '@sveltejs/kit';

/**
 * One bucket of assets of a Worker update, as the multipart body Cloudflare expects (a field per
 * hash with the base64 contents), with the upload token of `prepareWorkerUpdate` in
 * `x-upload-token`. Answers the completion token after the last bucket.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const jwt = request.headers.get('x-upload-token');
	const contentType = request.headers.get('content-type') ?? '';

	if (!jwt || !contentType.startsWith('multipart/form-data')) {
		error(400, 'Missing upload token or multipart body');
	}

	const result = await locals.services
		.updates()
		.uploadWorkerAssets(jwt, await request.arrayBuffer(), contentType);

	if (result.isErr()) {
		if (result.error.code === 21001) {
			error(400, 'This instance does not run as a Cloudflare Worker');
		}

		error(502, `Could not upload the files: ${result.error.data.reason}`);
	}

	return json({ jwt: result.value });
};
