import type { RequestHandler } from './$types';
import type { SubscriptionRequest } from '#lib/server/services/realtime.service.js';

import { error, json } from '@sveltejs/kit';

import { isInternalRequest } from '#lib/server/realtime/internal-secret.js';

/**
 * Whether a realtime socket may add a subscription, asked by its hub. Refusals carry the
 * protocol's error code, which the hub sends on to the client. Not part of the public API.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isInternalRequest(request.headers.get('authorization'))) {
		error(403, 'Only for the realtime hub');
	}

	const body = (await request.json()) as SubscriptionRequest;
	const result = await locals.services.realtime().checkSubscription(body);

	if (result.isErr()) {
		switch (result.error.code) {
			case 6006:
				return json(
					{ code: 'collection_not_found', message: 'Collection not found' },
					{ status: 404 }
				);
			case 22002:
				return json(
					{ code: 'forbidden', message: "The collection's view rule doesn't allow this" },
					{ status: 403 }
				);
			case 22003:
				return json(
					{ code: 'invalid_filter', message: result.error.data.message },
					{ status: 400 }
				);
			default:
				console.error('[realtime] subscribe failed', result.error);
				return json({ message: result.error.message }, { status: 500 });
		}
	}

	return json({});
};
