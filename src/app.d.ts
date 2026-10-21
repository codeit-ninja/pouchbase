import type { SessionUser } from '#lib/server/services/sessions.service.js';
import type { Services } from '#lib/server/services/services.js';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		interface Locals {
			services: Services;
			user: SessionUser | null;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
