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
			/** The signed-in user, once `currentUser()` loaded it; `null` when signed out. */
			user?: import('@pouchbasejs/js-sdk').User | null;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
