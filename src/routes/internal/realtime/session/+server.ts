import type { RequestHandler } from './$types';

import { error, json } from '@sveltejs/kit';

import { isInternalRequest } from '#lib/server/realtime/internal-secret.js';

/**
 * Who a realtime socket is, asked by its hub when the socket sends `auth` (see
 * `src/lib/server/realtime/hub-core.ts`). The hub passes on the cookie of the upgrade, so the
 * session hook knows the dashboard's admin. Not part of the public API.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isInternalRequest(request.headers.get('authorization'))) {
		error(403, 'Only for the realtime hub');
	}

	const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
	const token = typeof body?.token === 'string' && body.token ? body.token : null;
	const result = await locals.services.realtime().session(token);

	if (result.isErr()) {
		if (result.error.code === 11006 || result.error.code === 11007) {
			return json({ message: 'Invalid or expired token' }, { status: 401 });
		}

		console.error('[realtime] session failed', result.error);
		return json({ message: result.error.message }, { status: 500 });
	}

	return json(result.value);
};
