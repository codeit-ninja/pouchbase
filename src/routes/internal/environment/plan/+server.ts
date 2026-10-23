import type { RequestHandler } from './$types';

import { error, json } from '@sveltejs/kit';

import { SNAPSHOT_FORMAT } from '#lib/environments/snapshot.js';
import { snapshotSchema } from '#lib/schemas/environments.js';
import { requireDeployToken } from '#lib/server/environments.js';

/**
 * What publishing the snapshot in the body would change on this instance. Changes nothing: the
 * plan comes with the hash of this instance's state, which applying it has to send back.
 */
export const POST: RequestHandler = async (event) => {
	await requireDeployToken(event);

	const body: unknown = await event.request.json().catch(() => null);

	if (body && typeof body === 'object' && 'format' in body && body.format !== SNAPSHOT_FORMAT) {
		error(
			409,
			`Snapshot format ${String(body.format)} is not supported, expected ${SNAPSHOT_FORMAT}`
		);
	}

	const parsed = snapshotSchema.safeParse(body);

	if (!parsed.success) {
		error(400, 'Invalid snapshot');
	}

	const services = event.locals.services.environments();
	const [result, environment] = await Promise.all([services.plan(parsed.data), services.get()]);

	if (result.isErr()) {
		console.error('[environments] plan failed', result.error);
		error(500, result.error.message);
	}

	return json({
		...result.value,
		target: { environment: environment.isOk() ? environment.value : null }
	});
};
