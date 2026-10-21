import type { RequestHandler } from './$types';

import { isOAuthProvider } from '#lib/auth/oauth-providers.js';

const MESSAGES = {
	done: 'You are signed in. You can close this window.',
	access_denied: 'Sign-in was cancelled. You can close this window.',
	email_in_use:
		'An account with this email address already exists. Sign in with the provider you used before.',
	sign_in_failed: 'Sign-in failed. Close this window and try again.',
	expired: 'This sign-in has expired. Close this window and try again.'
};

/**
 * Small page shown in the popup. The app collects the result itself (by polling), so this page
 * only reports what happened and tries to close itself.
 */
function page(message: string, status = 200) {
	const html = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Sign-in</title>
		<style>
			body { margin: 0; min-height: 100svh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #fafafa; color: #18181b; }
			p { max-width: 22rem; padding: 0 1rem; text-align: center; font-size: 0.875rem; line-height: 1.5; }
		</style>
	</head>
	<body>
		<p>${message}</p>
		<script>setTimeout(() => window.close(), 1000);</script>
	</body>
</html>`;

	return new Response(html, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
	});
}

/** The provider redirects the popup here after the user signed in (or declined). */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!isOAuthProvider(params.provider)) {
		return page(MESSAGES.expired, 404);
	}

	const result = await locals.services
		.auth()
		.finishOAuth(
			params.provider,
			url.searchParams.get('state') ?? '',
			url.searchParams.get('code'),
			url.searchParams.get('error')
		);

	if (result.isErr()) {
		return page(MESSAGES.expired, result.error.code === 11011 ? 400 : 500);
	}

	return page(result.value.status === 'done' ? MESSAGES.done : MESSAGES[result.value.error]);
};
