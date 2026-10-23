import { error, invalid } from '@sveltejs/kit';

import { form, getRequestEvent, query } from '$app/server';

import { getEnvironment } from '#lib/remote/settings.remote.js';
import { mailSettingsSchema, testMailSchema } from '#lib/schemas/mail.js';
import { generalSettingsSchema } from '#lib/schemas/settings.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

export const updateGeneralSettings = form(generalSettingsSchema, async (data) => {
	const { services } = requireUser();

	const result = await services
		.environments()
		.set(data.environment === 'none' ? null : data.environment);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getEnvironment().refresh();

	return { saved: true };
});

/** The mail settings. The SMTP password is never included. */
export const getMailSettings = query(async () => {
	const { services } = requireUser();

	const result = await services.mail().settings();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const updateMailSettings = form(mailSettingsSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.mail().update({
		provider: data.provider,
		senderName: data.senderName,
		senderAddress: data.senderAddress,
		smtpHost: data.smtpHost,
		smtpPort: data.smtpPort,
		smtpSecurity: data.smtpSecurity,
		smtpUsername: data.smtpUsername,
		smtpPassword: data._smtpPassword
	});

	if (result.isErr()) {
		if (result.error.code === 15000) {
			invalid(
				issue.provider(
					'Cloudflare Email Service needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN'
				)
			);
		}

		error(500, result.error.message);
	}

	void getMailSettings().refresh();

	return { saved: true };
});

export const sendTestMail = form(testMailSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.mail().sendTest(data.to);

	if (result.isErr()) {
		if (result.error.code === 15001) {
			invalid('Save the mail settings with a sender address first');
		}

		if (result.error.code === 15004) {
			invalid(`Could not send the email: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return { sent: true };
});
