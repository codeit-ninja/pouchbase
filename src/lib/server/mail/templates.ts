/** The emails Pouchbase sends to app users: a subject, a plain-text and an HTML version. */

export type MailContent = {
	subject: string;
	text: string;
	html: string;
};

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** A short email with one button; every template uses this layout. */
function layout(input: {
	title: string;
	intro: string;
	action: string;
	url: string;
	outro: string;
}) {
	const url = escapeHtml(input.url);

	return `<!doctype html>
<html>
	<body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b">
		<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:32px">
			<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(input.title)}</h1>
			<p style="margin:0 0 24px;font-size:14px;line-height:22px">${escapeHtml(input.intro)}</p>
			<a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:6px">${escapeHtml(input.action)}</a>
			<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#71717a">${escapeHtml(input.outro)}<br><a href="${url}" style="color:#71717a;word-break:break-all">${url}</a></p>
		</div>
	</body>
</html>`;
}

export function verificationEmail(appName: string, url: string): MailContent {
	const intro = `Confirm your email address for ${appName} with the button below.`;
	const outro =
		"If you didn't create an account, you can ignore this email. The link is valid for 3 days.";

	return {
		subject: `Verify your email for ${appName}`,
		text: `${intro}\n\n${url}\n\n${outro}\n`,
		html: layout({ title: 'Verify your email', intro, action: 'Verify email', url, outro })
	};
}

export function passwordResetEmail(appName: string, url: string): MailContent {
	const intro = `Someone asked to reset the password of your ${appName} account. Choose a new password with the button below.`;
	const outro =
		"If you didn't ask for this, you can ignore this email; your password stays the same. The link is valid for 30 minutes.";

	return {
		subject: `Reset your password for ${appName}`,
		text: `${intro}\n\n${url}\n\n${outro}\n`,
		html: layout({ title: 'Reset your password', intro, action: 'Reset password', url, outro })
	};
}

export function testEmail(appName: string): MailContent {
	const text = `This is a test email from ${appName}. Your mail settings work.`;

	return {
		subject: `Test email from ${appName}`,
		text: `${text}\n`,
		html: `<!doctype html><html><body style="font-family:sans-serif;font-size:14px;color:#18181b"><p>${escapeHtml(text)}</p></body></html>`
	};
}
