import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { form, getRequestEvent, query } from '$app/server';

import { splitThumbnailSizes } from '#lib/files/thumbnails.js';
import { thumbnailSettingsSchema } from '#lib/schemas/collection-settings.js';

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
