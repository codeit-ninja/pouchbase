import type { RequestHandler } from './$types';

import { error } from '@sveltejs/kit';

import { CLOUDFLARE_API_TOKEN } from '$app/env/private';

import { json } from '#lib/server/api.js';

/** How long one tick may run steps of backups and restores. */
const BUDGET = 25 * 1000;

/**
 * The token the scheduler sends, derived from the Cloudflare API token so both sides know it
 * without extra configuration. Keep in sync with `scripts/worker-entry.mjs` and `server.mjs`.
 */
async function tickToken() {
	const data = new TextEncoder().encode(`pouchbase-tick:${CLOUDFLARE_API_TOKEN}`);
	const digest = await crypto.subtle.digest('SHA-256', data);

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Runs scheduled work once a minute: the Cron Trigger of the Worker and the timer of the Node
 * server call it (see `scripts/worker-entry.mjs` and `server.mjs`). Not part of the public API.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (request.headers.get('authorization') !== `Bearer ${await tickToken()}`) {
		error(401, 'Invalid tick token');
	}

	const result = await locals.services.backups().tick(BUDGET);

	if (result.isErr()) {
		console.error('[tick] backups failed', result.error);
		error(500, result.error.message);
	}

	return json({ backups: result.value });
};
