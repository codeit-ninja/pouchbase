import type { ApiKey } from './services/api-keys.service';
import type { ApiAccess } from './services/records.service';
import type { RequestEvent } from '@sveltejs/kit';

import { API_KEY_PREFIX } from './services/api-keys.service';

/**
 * Helpers for the public API (`/api/...`) that client apps call. The API can be
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

/**
 * The API key of the request's bearer token (`pbk_…`, see `ApiKeysService`), for routes only
 * server-side code may call. Without a valid key the route answers with the `401` response.
 */
export async function requestApiKey(
	event: RequestEvent
): Promise<{ key: ApiKey } | { response: Response }> {
	const token = bearerToken(event);

	if (!token) {
		return { response: json({ message: 'Send an API key as `Authorization: Bearer pbk_…`' }, 401) };
	}

	const result = await event.locals.services.apiKeys().verify(token);

	if (result.isErr()) {
		return { response: json({ message: 'Could not check the API key' }, 500) };
	}

	if (!result.value) {
		return { response: json({ message: 'Invalid API key' }, 401) };
	}

	return { key: result.value };
}

/**
 * Who the records API acts for: the user of the request's bearer token (`{ auth }`, see
 * `requestUser`), or `undefined` for an API key with the `service` scope, which the API rules don't
 * apply to. Other API keys get a `403` response, an invalid key a `401`.
 */
export async function requestAccess(
	event: RequestEvent
): Promise<{ access: ApiAccess | undefined } | { response: Response }> {
	if (!bearerToken(event)?.startsWith(API_KEY_PREFIX)) {
		const caller = await requestUser(event);

		return 'response' in caller ? caller : { access: { auth: caller.user } };
	}

	const caller = await requestServiceKey(event, 'use the records API');

	return 'response' in caller ? caller : { access: undefined };
}

/**
 * The API key of the request when it has the `service` scope, for routes that act as an admin
 * (such as the collections API). Other keys get a `403` response, an invalid key a `401`.
 *
 * @param purpose What the key is for, in the `403` message: `Only an API key with the service
 *   scope can <purpose>`.
 */
export async function requestServiceKey(
	event: RequestEvent,
	purpose: string
): Promise<{ key: ApiKey } | { response: Response }> {
	const caller = await requestApiKey(event);

	if ('response' in caller) {
		return caller;
	}

	if (caller.key.scope !== 'service') {
		return {
			response: json({ message: `Only an API key with the service scope can ${purpose}` }, 403)
		};
	}

	return caller;
}
