import type { RequestHandler } from './$types';

import { json, preflight, requestApiKey } from '#lib/server/api.js';
import { readJsonObject } from '#lib/server/api-body.js';
import { sendMailSchema } from '#lib/schemas/mail-templates.js';

/**
 * Sends an email template. Needs an API key (`Authorization: Bearer pbk_…`), so only server-side
 * code (a back-end or a function, which has `env.POUCHBASE_API_KEY`) can send email; app users
 * can't. Body: `{ "template", "to": "a@b.c" | ["a@b.c", …], "variables"?: { … } }`. Every
 * recipient gets an email of their own; answers `{ "sent": <count> }`.
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requestApiKey(event);

	if ('response' in auth) {
		return auth.response;
	}

	const parsed = sendMailSchema.safeParse(await readJsonObject(event.request));

	if (!parsed.success) {
		return json(
			{
				message: 'Send a JSON body with `template`, `to` and optionally `variables`',
				issues: Object.fromEntries(
					parsed.error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message])
				)
			},
			400
		);
	}

	const { template, to, variables } = parsed.data;
	const result = await event.locals.services.mailTemplates().send(template, to, variables);

	if (result.isErr()) {
		switch (result.error.code) {
			case 24001:
				return json({ message: `There is no email template named "${template}"` }, 404);
			case 24003:
				return json(
					{ message: "Pouchbase sends this template itself; it can't be sent through the API" },
					403
				);
			case 24004:
				return json(
					{
						message: `Missing variables: ${result.error.data.missing.join(', ')}`,
						issues: Object.fromEntries(
							result.error.data.missing.map((name) => [`variables.${name}`, 'Required'])
						)
					},
					422
				);
			case 24005:
				return json({ message: 'The template has errors; fix it on the Mail page' }, 422);
			case 15001:
				return json({ message: 'Sending email is not set up' }, 503);
			case 15004:
				return json({ message: `Could not send the email: ${result.error.data.reason}` }, 502);
			default:
				return json({ message: 'Could not send the email' }, 500);
		}
	}

	return json(result.value);
};

export const OPTIONS: RequestHandler = preflight;
