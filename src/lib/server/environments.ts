import type { RequestEvent } from '@sveltejs/kit';

import { error } from '@sveltejs/kit';

import { bearerToken } from './api';

/**
 * Checks the deploy token of a request from another instance (`/internal/environment/...`), and
 * answers `401` without a valid one. These endpoints are not part of the public API.
 */
export async function requireDeployToken(event: RequestEvent) {
	const token = bearerToken(event);

	if (!token) {
		error(401, 'Missing deploy token');
	}

	const result = await event.locals.services.environments().verifyToken(token);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	if (!result.value) {
		error(401, 'Invalid deploy token');
	}

	return result.value;
}
