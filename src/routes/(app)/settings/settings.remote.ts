import { error } from '@sveltejs/kit';

import { form, getRequestEvent } from '$app/server';

import { getAppName } from '#lib/remote/settings.remote.js';
import { generalSettingsSchema } from '#lib/schemas/settings.js';

export const updateGeneralSettings = form(generalSettingsSchema, async (data) => {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const result = await locals.services.settings().set('app_name', data.appName);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getAppName().refresh();

	return { saved: true };
});
