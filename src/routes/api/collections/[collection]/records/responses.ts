import type { ServiceError } from '#lib/server/services/base.service.js';

import { API_RULE_LABELS } from '#lib/filter/rules.js';
import { json } from '#lib/server/api.js';

/** A comma-separated query parameter as a list; `undefined` without it. */
function list(url: URL, param: string) {
	const names = url.searchParams
		.get(param)
		?.split(',')
		.map((name) => name.trim())
		.filter(Boolean);

	return names?.length ? names : undefined;
}

/**
 * What the records API returns of each record: `?fields=id,title` and
 * `?expand=author,comments.author` (relation fields to replace by their records).
 */
export function readOptions(url: URL) {
	return { fields: list(url, 'fields'), expand: list(url, 'expand') };
}

/**
 * The response for a failed request to the records API. `fallback` is the message for unexpected
 * errors, such as `Could not list the records`.
 */
export function errorResponse(error: ServiceError<number, string>, fallback: string) {
	const data = (error.data ?? {}) as Record<string, unknown>;

	switch (error.code) {
		case 6006:
			return json({ message: 'Collection not found' }, 404);
		case 8001:
			return json({ message: 'Invalid record', issues: data.issues ?? {} }, 400);
		case 8002:
			return json(
				{
					message: 'A record with this value already exists',
					issues: { [String(data.field)]: 'This value is already in use' }
				},
				409
			);
		case 8003:
			return json({ message: 'Record not found' }, 404);
		case 8012:
			return json({ message: 'The collection has no fields yet' }, 400);
		case 8013:
			return json({ message: 'The records API doesn’t offer this for this collection' }, 403);
		case 8014:
			return json({ message: 'Only admins can do this: the API rule is locked' }, 403);
		case 8015:
			return json({ message: `Invalid ${String(data.param)}: ${String(data.message)}` }, 400);
		case 8016: {
			const action = API_RULE_LABELS[data.action as keyof typeof API_RULE_LABELS] ?? 'API';
			return json({ message: `The ${action} rule of this collection is invalid` }, 403);
		}
		case 8017:
			return json({ message: 'The create rule of this collection doesn’t allow this record' }, 403);
		default:
			return json({ message: fallback }, 500);
	}
}
