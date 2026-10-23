import { error, invalid } from '@sveltejs/kit';

import { form, getRequestEvent } from '$app/server';

import { resetPasswordSchema, verifyEmailSchema } from '#lib/schemas/password-auth.js';

/** Sets the new password of an app user, from the link in the reset email. */
export const resetPassword = form(resetPasswordSchema, async (data, issue) => {
	const { locals } = getRequestEvent();

	const result = await locals.services.auth().confirmPasswordReset(data.token, data._password);

	if (result.isErr()) {
		switch (result.error.code) {
			case 11025:
				invalid(issue._password(result.error.data.issues.password ?? 'Invalid password'));
				break;
			case 11028:
				invalid('This link is invalid or has expired. Ask for a new one in the app.');
				break;
			default:
				error(500, result.error.message);
		}
	}

	return { reset: true };
});

/** Verifies the email address of an app user, from the link in the verification email. */
export const verifyEmail = form(verifyEmailSchema, async (data) => {
	const { locals } = getRequestEvent();

	const result = await locals.services.auth().confirmVerification(data.token);

	if (result.isErr()) {
		if (result.error.code === 11029) {
			invalid('This link is invalid or has expired. Ask for a new one in the app.');
		}

		error(500, result.error.message);
	}

	return { verified: true };
});
