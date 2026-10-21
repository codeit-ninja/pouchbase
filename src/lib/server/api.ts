import type { RequestEvent } from '@sveltejs/kit';

/**
 * Helpers for the public API (`/api/...`) that client apps call. Like PocketBase, the API can be
 * called from any origin: it uses bearer tokens, never cookies, so CORS can't leak a session.
 */

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Max-Age': '600'
};

/** JSON response with CORS headers. */
export function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
	});
}

/** Answers a CORS preflight request. */
export function preflight() {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** The token from an `Authorization: Bearer <token>` header. */
export function bearerToken(event: RequestEvent) {
	const header = event.request.headers.get('authorization') ?? '';
	const [scheme, token] = header.split(' ');

	return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
