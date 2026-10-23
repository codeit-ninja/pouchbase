import type { RequestHandler } from './$types';
import type { AuthorizeRequest } from '#lib/server/services/realtime.service.js';

import { error, json } from '@sveltejs/kit';

import { isInternalRequest } from '#lib/server/realtime/internal-secret.js';

/**
 * Who may see realtime events, asked by a hub that has subscribers for them: per event, the
 * record as the records API returns it and the access contexts the view rule and filter allow.
 * Not part of the public API.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isInternalRequest(request.headers.get('authorization'))) {
		error(403, 'Only for the realtime hub');
	}

	const body = (await request.json()) as AuthorizeRequest;
	const result = await locals.services.realtime().authorize(body);

	if (result.isErr()) {
		console.error('[realtime] authorize failed', result.error);
		return json({ message: result.error.message }, { status: 500 });
	}

	return json(result.value);
};
