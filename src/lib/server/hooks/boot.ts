import type { Handle } from '@sveltejs/kit/hooks';

import { POUCHBASE_LOG_TIMING } from '$app/env/private';

import { Services } from '../services/services';

export const boot: Handle = async ({ event, resolve }) => {
	event.locals.services = new Services();
	event.locals.user = null;

	// With `POUCHBASE_LOG_TIMING`, logs how long every request takes, next to the `[db]` lines of
	// `db/query.ts`.
	if (!POUCHBASE_LOG_TIMING) {
		return resolve(event);
	}

	const start = performance.now();

	try {
		return await resolve(event);
	} finally {
		console.log(
			`[req] ${Math.round(performance.now() - start)}ms ${event.request.method} ${event.url.pathname}${event.url.search}`
		);
	}
};
