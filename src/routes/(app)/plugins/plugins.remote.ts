import { error, invalid } from '@sveltejs/kit';
import { z } from 'zod';

import { form, getRequestEvent, query } from '$app/server';

import { pluginIdSchema, searchPluginsSchema } from '#lib/schemas/plugins.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/**
 * Plugins in the registry. A registry that can't be reached is not an error of the page: it comes
 * back as `error`, so the installed plugins still show.
 */
export const searchPlugins = query(searchPluginsSchema, async ({ query, page, category }) => {
	const { services } = requireUser();

	const result = await services.plugins().search(query, page, category);

	if (result.isErr()) {
		return {
			list: null,
			error: `The plugin registry can't be reached: ${result.error.data.reason}`
		};
	}

	return { list: result.value, error: null };
});

/** A plugin in the registry with its versions; for the install dialog. */
export const getPluginDetails = query(z.string(), async (id) => {
	const { services } = requireUser();

	const result = await services.plugins().details(id);

	if (result.isErr()) {
		error(502, `The plugin registry can't be reached: ${result.error.data.reason}`);
	}

	if (!result.value) {
		error(404, 'Plugin not found');
	}

	return result.value;
});

export const getInstalledPlugins = query(async () => {
	const { services } = requireUser();

	const result = await services.plugins().installed();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** Installs the newest version of a plugin that this Pouchbase can run, or updates to it. */
export const installPlugin = form(pluginIdSchema, async ({ id }) => {
	const { services } = requireUser();

	const result = await services.plugins().install(id);

	if (result.isErr()) {
		const { error: failure } = result;

		if (failure.code === 19000) {
			invalid(`The plugin registry can't be reached: ${failure.data.reason}`);
		}

		if (failure.code === 19002) {
			invalid('This plugin has no version that this Pouchbase can install');
		}

		if (failure.code === 19003) {
			invalid(failure.data.reason);
		}

		if (failure.code === 19004) {
			const issue = failure.data.issues[0];
			const detail = issue ? `: ${issue.path ? `${issue.path}: ` : ''}${issue.message}` : '';

			invalid(`The plugin's bundle is not valid${detail}`);
		}

		if (failure.code === 19007) {
			invalid(`The plugin's Worker could not be deployed: ${failure.data.reason}`);
		}

		if (failure.code === 19008) {
			invalid(
				`The sign-in provider ${failure.data.provider} already comes from the plugin ${failure.data.pluginId}`
			);
		}

		if (failure.code === 19009) {
			invalid(`The plugin's server code did not answer as expected: ${failure.data.reason}`);
		}

		if (failure.code === 19011) {
			invalid(
				'The Cloudflare account has no workers.dev subdomain yet. Open Workers & Pages in the Cloudflare dashboard once to choose one, then try again.'
			);
		}

		error(500, failure.message);
	}

	void getInstalledPlugins().refresh();

	return { name: result.value.name, version: result.value.version };
});

export const uninstallPlugin = form(pluginIdSchema, async ({ id }) => {
	const { services } = requireUser();

	const result = await services.plugins().uninstall(id);

	if (result.isErr()) {
		if (result.error.code === 19010) {
			invalid('Built-in plugins ship with Pouchbase and cannot be removed');
		}

		error(500, result.error.message);
	}

	if (!result.value) {
		error(404, 'Plugin not installed');
	}

	void getInstalledPlugins().refresh();

	return { removed: true };
});
