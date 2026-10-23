import type { SessionUser } from '#lib/server/services/sessions.service.js';
import type { Services } from '#lib/server/services/services.js';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			/** Only on Workers; the Node target (Docker, the binary) has no execution context. */
			ctx?: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		interface Locals {
			services: Services;
			user: SessionUser | null;
		}
		// interface PageData {}
		interface PageState {
			/** Opens the edit collection sheet, e.g. right after creating the collection. */
			editCollection?: boolean;
		}
	}
}

export {};
