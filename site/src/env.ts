import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import { z } from 'zod';

/**
 * The site uses a Pouchbase instance as the back-end of the plugin registry and of accounts. Both
 * variables are optional during `vite build`.
 */
const required = building ? z.string().optional() : z.string().min(1);

export const variables = defineEnvVars({
	POUCHBASE_URL: {
		description:
			'Origin of the Pouchbase instance that stores the accounts and plugins, e.g. https://api.pouchbase.io; public, because GitHub sign-in opens it in a popup',
		public: true,
		schema: required
	},
	POUCHBASE_SERVICE_KEY: {
		description:
			'API key (`pbk_…`) with the service scope from that instance (System → API keys), so the registry can write plugins, versions and publish tokens',
		schema: required
	}
});
