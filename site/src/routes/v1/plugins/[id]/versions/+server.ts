import type { RequestHandler } from './$types';

import { MAX_BUNDLE_SIZE } from '@pouchbasejs/plugin-sdk';

import { publisherOf } from '#lib/server/publish-tokens.js';
import {
	failureResponse,
	registryError,
	registryJson,
	registryPreflight
} from '#lib/server/registry-http.js';
import { publishVersion } from '#lib/server/registry.js';

/**
 * `POST /v1/plugins/:id/versions` with the bundle as body and `Authorization: Bearer <token>` (a
 * publish token or a user's token) → `201` `PluginVersion`; `401` without a valid token, `403` for
 * someone else's plugin, `409` for a version that exists and `422` for an invalid bundle.
 */
export const POST: RequestHandler = async ({ params, request, url }) => {
	const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');

	if (scheme?.toLowerCase() !== 'bearer' || !token) {
		return registryError(401, 'unauthorized', 'Send a publish token as Authorization: Bearer');
	}

	if (Number(request.headers.get('content-length') ?? 0) > MAX_BUNDLE_SIZE) {
		return registryError(413, 'too_large', `Bundles are at most ${MAX_BUNDLE_SIZE / 1024} KiB`);
	}

	try {
		const userId = await publisherOf(token);

		if (!userId) {
			return registryError(401, 'unauthorized', 'Invalid or expired token');
		}

		const bytes = new Uint8Array(await request.arrayBuffer());
		const version = await publishVersion(url.origin, userId, params.id, bytes);

		return registryJson(version, 201);
	} catch (error) {
		return failureResponse(error);
	}
};

export const OPTIONS: RequestHandler = registryPreflight;
