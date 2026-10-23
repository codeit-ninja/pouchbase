import type { ServiceError } from '#lib/server/services/base.service.js';

import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { command, form, getRequestEvent, query } from '$app/server';

import {
	deployTokenIdSchema,
	deployTokenSchema,
	linkRemoteSchema
} from '#lib/schemas/environments.js';

/** How long one call may run steps of a publish or pull. */
const STEP_BUDGET = 20 * 1000;

const directionSchema = z.enum(['publish', 'pull']);

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** Turns the errors of a publish or pull into responses the page can show. */
function remoteFailure(failure: ServiceError<number, string>): never {
	const data = failure.data as { status?: number; message?: string } | undefined;

	const messages: Record<number, [number, string]> = {
		20004: [409, 'The target changed since the plan was made. Plan again.'],
		20005: [400, 'Confirm that the plan removes data or code.'],
		20006: [409, 'A publish, backup or restore is running on the target.'],
		16003: [409, 'A publish, backup or restore is running on the target.'],
		20008: [400, 'Link an instance first.'],
		20009: [502, `The linked instance answered: ${data?.message ?? 'unknown error'}`],
		20010: [409, 'The source changed since the plan was made. Plan again.']
	};
	const known = messages[failure.code];

	if (known) {
		error(known[0], known[1]);
	}

	error(500, failure.message);
}

export const getDeployTokens = query(async () => {
	const { services } = requireUser();

	const result = await services.environments().tokens();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** Creates a deploy token and returns it; it is shown once and can't be read back. */
export const createDeployToken = form(deployTokenSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.environments().createToken(data.name);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getDeployTokens().refresh();

	return { token: result.value.token };
});

export const deleteDeployToken = form(deployTokenIdSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.environments().deleteToken(data.id);

	if (result.isErr()) {
		if (result.error.code === 20002) {
			error(404, 'Deploy token not found');
		}

		error(500, result.error.message);
	}

	void getDeployTokens().refresh();

	return { deleted: true };
});

/** The linked instance, without its token. */
export const getRemote = query(async () => {
	const { services } = requireUser();

	const result = await services.environments().remote();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const linkRemote = form(linkRemoteSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.environments().link(data.url, data._token);

	if (result.isErr()) {
		if (result.error.code === 20009) {
			const { status, message } = result.error.data;

			invalid(
				status === 401
					? 'The deploy token is not valid on that instance'
					: `Could not link the instance: ${message}`
			);
		}

		error(500, result.error.message);
	}

	void getRemote().refresh();

	return { environment: result.value.environment };
});

export const unlinkRemote = command(async () => {
	const { services } = requireUser();

	const result = await services.environments().unlink();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getRemote().refresh();
});

/** What a publish to the linked instance, or a pull from it, would change. */
export const planRemote = command(directionSchema, async (direction) => {
	const { services } = requireUser();

	const result = await services.environments().remotePlan(direction);

	if (result.isErr()) {
		remoteFailure(result.error);
	}

	return result.value;
});

export const startRemote = command(
	z.object({
		direction: directionSchema,
		sourceHash: z.string(),
		targetHash: z.string(),
		confirmDestructive: z.boolean()
	}),
	async ({ direction, ...input }) => {
		const { services } = requireUser();

		const result = await services.environments().startRemote(direction, input);

		if (result.isErr()) {
			remoteFailure(result.error);
		}

		return result.value;
	}
);

/** Runs steps of a publish or pull and returns its status. */
export const advanceRemote = command(
	z.object({ direction: directionSchema, id: z.string() }),
	async ({ direction, id }) => {
		const { services } = requireUser();

		const result = await services.environments().advanceRemote(direction, id, STEP_BUDGET);

		if (result.isErr()) {
			remoteFailure(result.error);
		}

		if (!result.value) {
			error(404, 'Deployment not found');
		}

		if (direction === 'pull' && result.value.status !== 'running') {
			void getDeployments().refresh();
		}

		return result.value;
	}
);

/** Publishes and pulls into this instance, newest first. */
export const getDeployments = query(async () => {
	const { services } = requireUser();

	const result = await services.environments().deployments();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});
