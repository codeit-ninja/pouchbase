import { error, invalid, redirect } from '@sveltejs/kit';
import { z } from 'zod';

import { command, form, getRequestEvent, query } from '$app/server';

import {
	createFunctionSchema,
	deleteFunctionSecretSchema,
	deployFunctionSchema,
	functionIdSchema,
	functionLogsSchema,
	functionSecretSchema,
	functionSettingsSchema,
	functionVersionSchema,
	restoreFunctionVersionSchema,
	testFunctionSchema
} from '#lib/schemas/functions.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

const NO_SUBDOMAIN =
	'The Cloudflare account has no workers.dev subdomain yet. Open Workers & Pages in the Cloudflare dashboard once to choose one, then try again.';

/** Every function, by name. */
export const getFunctions = query(async () => {
	const { services } = requireUser();

	const result = await services.functions().list();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** A function with the code that runs. */
export const getFunction = query(z.string(), async (name) => {
	const { services } = requireUser();

	const result = await services.functions().get(name);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	if (!result.value) {
		error(404, 'Function not found');
	}

	return result.value;
});

export const createFunction = form(createFunctionSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.functions().create(data);

	if (result.isErr()) {
		if (result.error.code === 18002) {
			invalid(issue.name('A function with this name already exists'));
		}

		if (result.error.code === 18004) {
			invalid(NO_SUBDOMAIN);
		}

		if (result.error.code === 18005) {
			// The function exists; its page shows that it isn't deployed yet.
			console.error(`[functions] first deploy of ${data.name} failed: ${result.error.data.reason}`);
		} else {
			error(500, result.error.message);
		}
	}

	void getFunctions().refresh();

	redirect(303, `/functions/${data.name}`);
});

export const updateFunction = form(functionSettingsSchema, async (data) => {
	const { services } = requireUser();

	const result = await services
		.functions()
		.update(data.id, { description: data.description, requireAuth: data.requireAuth });

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		error(500, result.error.message);
	}

	void getFunctions().refresh();

	return { saved: true };
});

export const deleteFunction = form(functionIdSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().delete(data.id);

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18006) {
			invalid('Could not delete the Worker on Cloudflare. Try again.');
		}

		error(500, result.error.message);
	}

	void getFunctions().refresh();

	redirect(303, '/functions');
});

/** Deploys the code from the editor as a new version. */
export const deployFunction = command(deployFunctionSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().deploy(data.id, {
		language: data.language,
		source: data.source,
		compiled: data.compiled
	});

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18003) {
			error(413, 'The code is larger than 1 MB');
		}

		if (result.error.code === 18004) {
			error(409, NO_SUBDOMAIN);
		}

		if (result.error.code === 18005) {
			error(422, `Cloudflare did not accept the code: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getFunctions().refresh();

	return result.value;
});

/** Every deployed version, newest first. */
export const getFunctionVersions = query(z.string(), async (id) => {
	const { services } = requireUser();

	const result = await services.functions().versions(id);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

/** The code of a version, to look at before restoring it. */
export const getFunctionVersionSource = query(functionVersionSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().versionSource(data.id, data.versionId);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	if (!result.value) {
		error(404, 'Version not found');
	}

	return result.value;
});

export const restoreFunctionVersion = form(restoreFunctionVersionSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().restore(data.id, data.versionId);

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18007) {
			error(404, 'Version not found');
		}

		if (result.error.code === 18003) {
			invalid('The code is larger than 1 MB');
		}

		if (result.error.code === 18004) {
			invalid(NO_SUBDOMAIN);
		}

		if (result.error.code === 18005) {
			invalid(`Cloudflare did not accept the code: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getFunctions().refresh();
	void getFunctionVersions(data.id).refresh();

	return { version: result.value.number };
});

/** Names of the function's secrets. */
export const getFunctionSecrets = query(z.string(), async (id) => {
	const { services } = requireUser();

	const result = await services.functions().secrets(id);

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18008) {
			error(502, `Could not load the secrets: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return result.value;
});

export const setFunctionSecret = form(functionSecretSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().setSecret(data.id, data.name, data._value);

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18009) {
			invalid('Deploy the function before adding secrets');
		}

		if (result.error.code === 18008) {
			invalid(`Could not save the secret: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getFunctionSecrets(data.id).refresh();

	return { saved: true };
});

export const deleteFunctionSecret = form(deleteFunctionSecretSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().deleteSecret(data.id, data.name);

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18008) {
			invalid(`Could not delete the secret: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	void getFunctionSecrets(data.id).refresh();

	return { deleted: true };
});

/**
 * Recent log lines. `forbidden` when the API token may not read Workers Observability, so the page
 * can explain which permission to add.
 */
export const getFunctionLogs = query(functionLogsSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().logs(data.id, data.hours);

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18011) {
			return { forbidden: true as const, logs: [] };
		}

		error(500, result.error.message);
	}

	return { forbidden: false as const, logs: result.value };
});

/** Sends a request from the test panel to the deployed function. */
export const testFunction = command(testFunctionSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.functions().test(data.id, {
		method: data.method,
		path: data.path,
		headers: data.headers,
		body: data.body
	});

	if (result.isErr()) {
		if (result.error.code === 18001) {
			error(404, 'Function not found');
		}

		if (result.error.code === 18009) {
			error(409, 'Deploy the function first');
		}

		if (result.error.code === 18012) {
			error(502, `The function could not be reached: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return result.value;
});
