import { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } from '$app/env/private';

import { PlatformError } from '../types';

/**
 * Minimal client for the Cloudflare REST API. D1 databases and R2 buckets are created through the
 * API during installation and used through the API afterwards, so no wrangler bindings are needed.
 */

export const API_URL = 'https://api.cloudflare.com/client/v4';

interface ApiResponse<T> {
	success: boolean;
	errors: { code: number; message: string }[];
	result: T;
}

export class CloudflareApiError extends PlatformError {
	constructor(status: number, errors: { code: number; message: string }[]) {
		super(status, errors, 'Cloudflare API');
	}
}

/** Raw request to an account-level Cloudflare API endpoint. */
export function cloudflareFetch(path: string, init: RequestInit = {}) {
	return fetch(`${API_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, ...init.headers }
	});
}

/** JSON request to an account-level Cloudflare API endpoint; throws `CloudflareApiError`. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await cloudflareFetch(path, {
		...init,
		headers: { 'Content-Type': 'application/json', ...init.headers }
	});

	const body = (await response.json()) as ApiResponse<T>;

	if (!response.ok || !body.success) {
		throw new CloudflareApiError(response.status, body.errors ?? []);
	}

	return body.result;
}

/** Turns a failed response (JSON or not) into a `CloudflareApiError`. */
export async function failure(response: Response) {
	const body = (await response.json().catch(() => null)) as {
		errors?: { code: number; message: string }[];
	} | null;

	return new CloudflareApiError(response.status, body?.errors ?? []);
}
