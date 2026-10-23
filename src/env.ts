import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import { z } from 'zod';

/**
 * Pouchbase stores its data on Cloudflare (D1 and R2) whether it runs as a Worker or as a Node
 * server, so the Cloudflare credentials are always required. All variables are optional during
 * `vite build`.
 */
const cloudflare = building ? z.string().optional() : z.string().min(1);

export const variables = defineEnvVars({
	CLOUDFLARE_ACCOUNT_ID: {
		description: 'Cloudflare account ID in which the `pouchbase` D1 database is created',
		schema: cloudflare
	},
	CLOUDFLARE_API_TOKEN: {
		description:
			'Cloudflare API token with Account → Workers Scripts, D1, Workers R2 Storage (Edit) and Account Analytics (Read); Workers Observability (Edit) shows the logs of functions',
		schema: cloudflare
	},
	PLUGIN_REGISTRY_URL: {
		description:
			'Plugin registry the Plugins page searches and installs from; defaults to the public registry on pouchbase.io. `pouchbase-plugin dev` prints the URL of a local one',
		schema: z.url().optional()
	},
	POUCHBASE_LOG_TIMING: {
		description:
			'`true` logs the duration of every request and database round-trip, to find out what makes a page slow',
		schema: (value) => value === 'true'
	}
});
