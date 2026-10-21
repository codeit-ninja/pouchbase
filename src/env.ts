import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import { z } from 'zod';

// Optional during `vite build`, required when the app starts.
const required = building ? z.string().optional() : z.string().min(1);

export const variables = defineEnvVars({
	CLOUDFLARE_ACCOUNT_ID: {
		description: 'Cloudflare account ID in which the `pouchbase` D1 database is created',
		schema: required
	},
	CLOUDFLARE_API_TOKEN: {
		description: 'Cloudflare API token with at least Account → D1 → Edit',
		schema: required
	}
});
