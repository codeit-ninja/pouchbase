import { error, invalid } from '@sveltejs/kit';

import { form, getRequestEvent, query } from '$app/server';

import { passwordProviderSchema } from '#lib/schemas/password-auth.js';
import { oauthProviderSchema } from '#lib/schemas/settings.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** The OAuth providers and the email & password settings. Client secrets are never included. */
export const getAuthSettings = query(async () => {
	const { services } = requireUser();

	const result = await services
		.oauthProviders()
		.list()
		.andThen((providers) =>
			services
				.auth()
				.passwordSettings()
				.map((password) => ({ providers, password }))
		);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const updatePasswordProvider = form(passwordProviderSchema, async (data, issue) => {
	const { services } = requireUser();

	if (data.requireVerification) {
		const mail = await services.mail().enabled();

		if (mail.isErr()) {
			error(500, mail.error.message);
		}

		if (!mail.value) {
			invalid(issue.requireVerification('Set up mail on the Mail page first'));
		}
	}

	const result = await services.auth().updatePasswordSettings({
		enabled: data.enabled,
		// Sign-up only makes sense while the provider is active.
		signUp: data.enabled && data.signUp,
		requireVerification: data.requireVerification
	});

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getAuthSettings().refresh();

	return { saved: true };
});

export const updateOAuthProvider = form(oauthProviderSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.oauthProviders().update(data.provider, {
		enabled: data.enabled,
		clientId: data.clientId,
		clientSecret: data._clientSecret
	});

	if (result.isErr()) {
		if (result.error.code === 10003) {
			invalid(issue.enabled('Enter a client ID and client secret before enabling'));
		}

		error(500, result.error.message);
	}

	void getAuthSettings().refresh();

	return { saved: true };
});
