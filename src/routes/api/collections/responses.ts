import type { Plan } from '#lib/environments/diff.js';
import type { ImportProblem } from '#lib/collections/transfer.js';
import type { ServiceError } from '#lib/server/services/base.service.js';
import type { ZodError } from 'zod';

import { describeStep, describeWarning } from '#lib/environments/describe.js';
import { json } from '#lib/server/api.js';

/** What the service key is for, in the `403` for other API keys. */
export const PURPOSE = 'manage collections';

/** `?<name>=true`. */
export function flag(url: URL, name: string) {
	return url.searchParams.get(name) === 'true';
}

/** A `400` for a body that doesn't match its schema, with an issue per field. */
export function invalidBody(message: string, error: ZodError) {
	return json(
		{
			message,
			issues: Object.fromEntries(
				error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message])
			)
		},
		400
	);
}

/** A plan with a description per step and warning, as the collections API returns it. */
export function planBody(plan: Plan) {
	return {
		steps: plan.steps.map((step) => ({ ...step, description: describeStep(step) })),
		warnings: plan.warnings.map((warning) => ({
			...warning,
			description: describeWarning(warning)
		}))
	};
}

/** Turns the errors of the collections service into responses. */
export function errorResponse(error: ServiceError<number, string>, fallback: string) {
	switch (error.code) {
		case 6002:
			return json({ message: 'This collection name is not allowed' }, 400);
		case 6003:
			return json({ message: 'A collection with this name already exists' }, 409);
		case 6006:
			return json({ message: 'Collection not found' }, 404);
		case 6009:
			return json(
				{
					message:
						'Relation fields of other collections point to this collection; delete those fields first'
				},
				409
			);
		case 6011:
			return json({ message: "Built-in collections can't be renamed or deleted" }, 403);
		case 6015: {
			const { problems } = error.data as { problems: ImportProblem[] };

			return json(
				{
					message: 'Relation fields point at collections this instance does not have',
					issues: Object.fromEntries(
						problems.map((problem) => [
							`${problem.collection}.${problem.field}`,
							problem.related
								? `The collection ${problem.related} does not exist`
								: 'The related collection does not exist'
						])
					)
				},
				422
			);
		}
		case 6016:
			return json(
				{
					message:
						'The changes delete collections, fields or their data; send `force=true` to make them',
					plan: planBody((error.data as { plan: Plan }).plan)
				},
				409
			);
		case 20006:
			return json(
				{ message: 'A publish, pull, backup or restore is running; try again once it is done' },
				409
			);
		case 20011: {
			const { done, reason } = error.data as { done: number; reason: string };

			return json({ message: `Stopped after ${done} changes: ${reason}`, done }, 422);
		}
		default:
			return json({ message: fallback }, 500);
	}
}
