import type { Plugin } from 'vite';

import { nodeHub } from '../src/lib/server/realtime/node-hub.ts';

/**
 * Realtime in `vite dev`: hands the WebSocket upgrades of `/api/realtime` to the Node hub, as
 * `server.mjs` does in production. Vite's own HMR socket ignores them, and the hub ignores Vite's.
 * The hub lives on `globalThis`, so the app (loaded by Vite) publishes to this same one.
 */
export function realtime(): Plugin {
	return {
		name: 'pouchbase:realtime',
		apply: 'serve',
		configureServer(server) {
			server.httpServer?.on('upgrade', (request, socket, head) => {
				nodeHub().upgrade(request, socket, head);
			});
		}
	};
}
