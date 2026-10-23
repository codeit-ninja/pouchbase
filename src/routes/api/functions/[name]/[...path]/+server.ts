import type { RequestHandler } from './$types';

import { bearerToken, json } from '#lib/server/api.js';

/**
 * Calls a function: the request (method, headers, body, and the path and query string after the
 * name) goes to the function's Worker, and its response comes back as it is. A valid bearer token
 * of an app user is passed on as the user (`pouchbaseUser(request)` in the function); functions
 * that require sign-in answer 401 without one. Like the rest of the API, any origin may call it.
 *
 * Responses are served from the admin's own origin, so they are sandboxed: HTML a function
 * returns can't run scripts here.
 */

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Expose-Headers': '*',
	'Access-Control-Max-Age': '600'
};

/** A response of a function, with CORS headers (unless it set its own) and the sandbox. */
function deliver(response: Response) {
	const headers = new Headers(response.headers);

	for (const [name, value] of Object.entries(CORS_HEADERS)) {
		if (!headers.has(name)) {
			headers.set(name, value);
		}
	}

	headers.set('Content-Security-Policy', 'sandbox');
	headers.set('X-Content-Type-Options', 'nosniff');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

export const OPTIONS: RequestHandler = () =>
	new Response(null, { status: 204, headers: CORS_HEADERS });

export const fallback: RequestHandler = async (event) => {
	const { params, request, url, locals } = event;
	const services = locals.services;

	const found = await services.functions().findPublic(params.name);

	if (found.isErr()) {
		return json({ message: 'Could not load the function' }, 500);
	}

	if (!found.value) {
		return json({ message: 'Function not found' }, 404);
	}

	const token = bearerToken(event);
	let user = null;

	if (token) {
		const verified = await services.auth().verifyToken(token);

		if (verified.isErr()) {
			if (verified.error.code === 11006 || verified.error.code === 11007) {
				return json({ message: 'Invalid or expired token' }, 401);
			}

			return json({ message: 'Could not load the user' }, 500);
		}

		user = verified.value;
	}

	if (found.value.requireAuth && !user) {
		return json({ message: 'Sign in to call this function' }, 401);
	}

	const result = await services
		.functions()
		.invoke(params.name, request, `/${params.path}${url.search}`, user);

	if (result.isErr()) {
		if (result.error.code === 18001 || result.error.code === 18009) {
			return json({ message: 'Function not found' }, 404);
		}

		if (result.error.code === 18012) {
			console.error(`[functions] ${params.name}: ${result.error.data.reason}`);

			return json({ message: 'The function could not be reached' }, 502);
		}

		return json({ message: 'Could not call the function' }, 500);
	}

	return deliver(result.value);
};
