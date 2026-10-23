import { USER_HEADER } from '#lib/functions/functions.js';

/**
 * The code around a function in its Worker. Functions are reached through `/api/functions/<name>`,
 * which checks the caller and forwards the request to the Worker's workers.dev URL with the
 * function's secret in `SECRET_HEADER`. The Worker only answers requests with that secret, removes
 * it before the function sees the request, and leaves the secret out of `env`.
 */

/** Module with the function's own code. */
export const FUNCTION_MODULE = 'function.js';

/** Main module of the Worker: the code below, which imports `FUNCTION_MODULE`. */
export const ENTRY_MODULE = 'pouchbase.js';

/** Request header with the function's secret, from Pouchbase to the Worker. */
export const SECRET_HEADER = 'x-pouchbase-function-secret';

export const ENTRY_CODE = `import handler from './${FUNCTION_MODULE}';

const encoder = new TextEncoder();

function matches(value, secret) {
	const left = encoder.encode(value ?? '');
	const right = encoder.encode(secret ?? '');

	return left.byteLength > 0 && left.byteLength === right.byteLength && crypto.subtle.timingSafeEqual(left, right);
}

globalThis.pouchbaseUser = (request) => {
	const value = request.headers.get('${USER_HEADER}');

	if (!value) {
		return null;
	}

	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
};

export default {
	async fetch(request, env, ctx) {
		if (!matches(request.headers.get('${SECRET_HEADER}'), env.POUCHBASE_FUNCTION_SECRET)) {
			return new Response('Not found', { status: 404 });
		}

		if (typeof handler?.fetch !== 'function') {
			return new Response('The function does not export a fetch handler: export default { fetch(request, env) { ... } }', { status: 500 });
		}

		const headers = new Headers(request.headers);
		headers.delete('${SECRET_HEADER}');

		const { POUCHBASE_FUNCTION_SECRET, ...rest } = env;

		return handler.fetch(new Request(request, { headers }), rest, ctx);
	}
};
`;

/** The Worker of a function. */
export function scriptName(functionName: string) {
	return `pouchbase-fn-${functionName}`;
}

/** JSON in a header: characters outside ASCII are escaped, so the header stays valid. */
export function headerJson(value: unknown) {
	return JSON.stringify(value).replace(
		/[\u007f-￿]/g,
		(character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
	);
}
