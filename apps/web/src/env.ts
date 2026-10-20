import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	POCKETBASE_URL: {
		public: true,
		description: 'URL van de PocketBase-backend',
		schema: (value) => value || 'http://127.0.0.1:8090'
	}
});
