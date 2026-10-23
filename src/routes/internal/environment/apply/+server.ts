import type { RequestHandler } from './$types';

import { error, json } from '@sveltejs/kit';
import { z } from 'zod';

import { snapshotSchema } from '#lib/schemas/environments.js';
import { requireDeployToken } from '#lib/server/environments.js';

const applySchema = z.object({
	snapshot: snapshotSchema,
	targetHash: z.string().min(1),
	confirmDestructive: z.boolean().default(false)
});

/** How long the first steps may run before the response; the rest runs in `.../advance`. */
const BUDGET = 10 * 1000;

/**
 * Publishes the snapshot in the body to this instance, as planned by `.../plan`. Answers `409`
 * when this instance changed since the plan was made, or while another job runs.
 */
export const POST: RequestHandler = async (event) => {
	const token = await requireDeployToken(event);
	const parsed = applySchema.safeParse(await event.request.json().catch(() => null));

	if (!parsed.success) {
		error(400, 'Invalid request');
	}

	const environments = event.locals.services.environments();
	const result = await environments.apply({
		source: parsed.data.snapshot,
		targetHash: parsed.data.targetHash,
		confirmDestructive: parsed.data.confirmDestructive,
		tokenId: token.id
	});

	if (result.isErr()) {
		const { code } = result.error;

		if (code === 20004) {
			error(409, 'This instance changed since the plan was made: plan the publish again');
		}

		if (code === 20005) {
			error(400, 'The plan removes data or code: confirm it to publish');
		}

		if (code === 20006 || code === 16003) {
			error(409, 'A publish, backup or restore is running on this instance');
		}

		error(500, result.error.message);
	}

	await environments.advance(BUDGET);

	const deployment = await environments.deployment(result.value.id);

	return json(deployment.isOk() ? deployment.value : result.value, { status: 201 });
};
