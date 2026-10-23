import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { form, getRequestEvent, query } from '$app/server';

import { splitThumbnailSizes } from '#lib/files/thumbnails.js';
import { USERS_COLLECTION } from '#lib/auth/users.js';
import { API_RULE_ACTIONS } from '#lib/filter/rules.js';
import { apiRulesSchema, thumbnailSettingsSchema } from '#lib/schemas/collection-settings.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** Settings of a collection; which sections apply depends on the collection. */
export const getCollectionSettings = query(z.string(), async (collection) => {
	const { services } = requireUser();
	const result = await services.collections().getSettings(collection);

	if (result.isErr()) {
		if (result.error.code === 6006) {
			error(404, 'Collection not found');
		}

		error(500, result.error.message);
	}

	return result.value;
});

/** Fields of `users`, which API rules can use as `@request.auth.<field>`. */
export const getUserFields = query(async () => {
	const { services } = requireUser();
	const result = await services.collections().requireWithFields(USERS_COLLECTION);

	if (result.isErr()) {
		if (result.error.code === 6006) {
			return [];
		}

		error(500, result.error.message);
	}

	return result.value.fields
		.filter((field) => field.type !== 'blob')
		.map((field) => ({ name: field.name, type: field.type }));
});

export const updateThumbnailSettings = form(thumbnailSettingsSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.collections().updateSettings(data.collection, {
		thumbnails: { enabled: data.enabled, sizes: splitThumbnailSizes(data.sizes) }
	});

	if (result.isErr()) {
		if (result.error.code === 6006) {
			invalid(issue.collection('Collection not found'));
		}

		error(500, result.error.message);
	}

	void getCollectionSettings(data.collection).refresh();

	return { saved: true };
});

/** The API rules of a collection; a locked action is saved as `null`. */
export const updateApiRules = form(apiRulesSchema, async (data, issue) => {
	const { services } = requireUser();
	const rules = Object.fromEntries(
		API_RULE_ACTIONS.map((action) => [action, data[`${action}Locked`] ? null : data[action]])
	);

	const result = await services.collections().updateRules(data.collection, rules);

	if (result.isErr()) {
		if (result.error.code === 6006) {
			invalid(issue.collection('Collection not found'));
		}

		if (result.error.code === 6014) {
			invalid(
				...Object.entries(result.error.data.issues).map(([action, message]) =>
					issue[action as (typeof API_RULE_ACTIONS)[number]](message)
				)
			);
		}

		error(500, result.error.message);
	}

	void getCollectionSettings(data.collection).refresh();

	return { saved: true };
});
