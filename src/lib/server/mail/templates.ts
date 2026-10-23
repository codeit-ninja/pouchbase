/**
 * Emails as the mail service sends them: a subject, a plain-text and an HTML version. The emails
 * to app users (verification, password reset) are email templates (`#lib/mail/mail-templates.ts`)
 * that admins can change on the Mail page.
 */

import { escapeHtml } from '#lib/mail/template.js';

export type MailContent = {
	subject: string;
	text: string;
	html: string;
};

export function testEmail(): MailContent {
	const text = 'This is a test email from Pouchbase. Your mail settings work.';

	return {
		subject: 'Test email from Pouchbase',
		text: `${text}\n`,
		html: `<!doctype html><html><body style="font-family:sans-serif;font-size:14px;color:#18181b"><p>${escapeHtml(text)}</p></body></html>`
	};
}
