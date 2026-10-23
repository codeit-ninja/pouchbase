import type { SessionUser } from '#lib/server/services/sessions.service.js';
import type { Services } from '#lib/server/services/services.js';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// No `Platform`: SvelteKit 3 doesn't set `event.platform` on Cloudflare. The Worker's bindings
		// and `waitUntil` come from `#lib/server/platform/runtime` (`cloudflare:workers`).

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
