import { FILES_COLLECTION } from '#lib/files/files.js';
import { USERS_COLLECTION } from '#lib/auth/users.js';

/**
 * API rules of a collection: one per action of the records API
 * (`/api/collections/<name>/records`). Shared between the client and the server.
 */

export const API_RULE_ACTIONS = ['list', 'view', 'create', 'update', 'delete'] as const;

export type ApiRuleAction = (typeof API_RULE_ACTIONS)[number];

/**
 * A rule per action:
 *
 * - `null` (or missing): locked; the action isn't available through the API, only to admins in the
 *   dashboard. The default, so new collections are private.
 * - `''`: anyone may, also without signing in.
 * - a filter expression (see `filter.ts`): only for records that match it, e.g.
 *   `author = @request.auth.id`. For `list` it filters the results; for `create` it is checked
 *   against the new record.
 */
export type ApiRules = Partial<Record<ApiRuleAction, string | null>>;

export const API_RULE_LABELS: Record<ApiRuleAction, string> = {
	list: 'List/Search',
	view: 'View',
	create: 'Create',
	update: 'Update',
	delete: 'Delete'
};

/**
 * The actions the records API offers for a collection. Users are created by signing up, and files
 * by uploading them, so those built-in collections leave some actions out.
 */
export function apiActions(collection: { name: string; system: boolean }): ApiRuleAction[] {
	if (collection.system && collection.name === USERS_COLLECTION) {
		return ['list', 'view', 'update', 'delete'];
	}

	if (collection.system && collection.name === FILES_COLLECTION) {
		return ['list', 'view', 'delete'];
	}

	return [...API_RULE_ACTIONS];
}

/** Fields of a built-in collection that can't be written through the records API. */
export function protectedApiFields(collection: { name: string; system: boolean }): string[] {
	// The address is changed through verification, and `verified` only by verifying it.
	return collection.system && collection.name === USERS_COLLECTION ? ['email', 'verified'] : [];
}

/** The rule of "Signed-in users": any request with a valid token. */
export const SIGNED_IN_RULE = '@request.auth.id != ""';

/**
 * The rule of "Owner": only the user whose id is in `field`, a relation to `users` (`?=` for a
 * multiple relation). For `users` itself, `id` is the user.
 */
export function ownerRule(field: string, multiple = false) {
	return `${field} ${multiple ? '?=' : '='} @request.auth.id`;
}
