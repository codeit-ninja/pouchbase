import type { RequestEvent } from '@sveltejs/kit';

/**
 * Helpers for the public API (`/api/...`) that client apps call. Like PocketBase, the API can be
 * called from any origin: it uses bearer tokens, never cookies, so CORS can't leak a session.
 */

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Max-Age': '600'
};

/** JSON response with CORS headers. */
export function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
	});
}

/** Plain text response with CORS headers, e.g. generated code. */
export function text(body: string, contentType = 'text/plain; charset=utf-8') {
	return new Response(body, { headers: { ...CORS_HEADERS, 'Content-Type': contentType } });
}

/** An empty `204 No Content` response with CORS headers, e.g. after a delete. */
export function noContent() {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
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

/**
 * The user of the request's bearer token, or `null` without one. An invalid or expired token gets
 * a `401` response instead, so the client notices it was signed out instead of seeing less data.
 */
export async function requestUser(
	event: RequestEvent
): Promise<{ user: Record<string, unknown> | null } | { response: Response }> {
	const token = bearerToken(event);

	if (!token) {
		return { user: null };
	}

	const result = await event.locals.services.auth().verifyToken(token);

	if (result.isErr()) {
		if (result.error.code === 11006 || result.error.code === 11007) {
			return { response: json({ message: 'Invalid or expired token' }, 401) };
		}

		return { response: json({ message: 'Could not check the token' }, 500) };
	}

	return { user: result.value };
}
