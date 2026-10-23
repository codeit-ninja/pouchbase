import type { RequestHandler } from './$types';

import { error, json } from '@sveltejs/kit';

/**
 * Deploys the latest release to the Worker: a multipart body with `assets` (the completion token
 * of the asset upload) and a `module:<name>` file per module of the release.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const data = await request.formData();
	const assets = data.get('assets');
	const modules = new Map<string, Blob>();

	for (const [key, value] of data) {
		if (key.startsWith('module:') && value instanceof Blob) {
			modules.set(key.slice('module:'.length), value);
		}
	}

	if (typeof assets !== 'string' || !assets) {
		error(400, 'Missing the completion token of the assets');
	}

	const result = await locals.services.updates().deployWorker(assets, modules);

	if (result.isErr()) {
		if (result.error.code === 21001) {
			error(400, 'This instance does not run as a Cloudflare Worker');
		}

		if (result.error.code === 21002) {
			error(409, 'There is no newer version to install');
		}

		if (result.error.code === 21006) {
			error(400, "The uploaded modules don't match the release");
		}

		if (result.error.code === 21007) {
			error(502, `Could not deploy the update: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return json({ version: result.value });
};
