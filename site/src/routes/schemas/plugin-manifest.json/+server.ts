import type { RequestHandler } from './$types';

import { manifestJsonSchema } from '@pouchbasejs/plugin-sdk';

/** The JSON Schema of `pouchbase-plugin.json`, at `MANIFEST_SCHEMA_URL`, for `"$schema"`. */

export const prerender = true;

export const GET: RequestHandler = () =>
	new Response(JSON.stringify(manifestJsonSchema(), null, '\t'), {
		headers: {
			'Content-Type': 'application/schema+json',
			'Cache-Control': 'public, max-age=3600',
			'Access-Control-Allow-Origin': '*'
		}
	});
