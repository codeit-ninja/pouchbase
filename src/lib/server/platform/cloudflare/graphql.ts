import { CLOUDFLARE_API_TOKEN } from '$app/env/private';

import { API_URL, CloudflareApiError } from './api';

/**
 * Cloudflare's GraphQL Analytics API (usage metrics of Workers, D1 and R2). It has its own envelope
 * (`{ data, errors }`) and lives outside the `/accounts/{id}` tree, so it doesn't go through `api()`.
 * Needs the `Account Analytics: Read` permission on the API token.
 */

type GraphqlError = {
	message: string;
	path?: (string | number)[];
	extensions?: { code?: string; timestamp?: string };
};

type GraphqlResponse<T> = {
	data: T | null;
	errors: GraphqlError[] | null;
};

/** Messages the API uses when the token lacks the analytics permission. */
const FORBIDDEN_PATTERN =
	/authentication|not authorized|unauthorized|permission|unable to find account/i;

function isForbidden(response: Response, errors: GraphqlError[]) {
	return (
		response.status === 401 ||
		response.status === 403 ||
		errors.some(
			(error) => error.extensions?.code === 'authz' || FORBIDDEN_PATTERN.test(error.message)
		)
	);
}

/**
 * Runs a query; throws `CloudflareApiError` on failure, with status 403 when the token is not
 * allowed to read analytics (the API itself answers such requests with 200 and an `errors` list).
 */
export async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const response = await fetch(`${API_URL}/graphql`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ query, variables })
	});

	const body = (await response.json().catch(() => null)) as GraphqlResponse<T> | null;
	const errors = body?.errors ?? [];

	if (!response.ok || errors.length || !body?.data) {
		const status = isForbidden(response, errors) ? 403 : response.ok ? 500 : response.status;

		throw new CloudflareApiError(
			status,
			errors.map((error) => ({ code: Number(error.extensions?.code) || 0, message: error.message }))
		);
	}

	return body.data;
}
