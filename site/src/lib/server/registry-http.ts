import type { RegistryErrorBody } from '@pouchbasejs/plugin-sdk';

import { RegistryFailure } from './registry';

/**
 * Responses of the registry API under `/v1`. Anyone may read the registry, from any origin;
 * publishing needs a bearer token, never a cookie.
 */

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Max-Age': '600'
};

export function registryJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...headers }
	});
}

export function registryError(status: number, code: string, message: string) {
	return registryJson({ error: { code, message } } satisfies RegistryErrorBody, status);
}

/** Answers a thrown `RegistryFailure`; anything else is rethrown. */
export function failureResponse(error: unknown) {
	if (!(error instanceof RegistryFailure)) {
		throw error;
	}

	const body: RegistryErrorBody = {
		error: {
			code: error.code,
			message: error.message,
			...(error.issues.length ? { issues: error.issues } : {})
		}
	};

	return registryJson(body, error.status);
}

export function registryPreflight() {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** The `apiVersion` query parameters (repeatable) as numbers; invalid ones are left out. */
export function apiVersionsOf(url: URL) {
	return url.searchParams
		.getAll('apiVersion')
		.map(Number)
		.filter((version) => Number.isSafeInteger(version) && version > 0);
}
