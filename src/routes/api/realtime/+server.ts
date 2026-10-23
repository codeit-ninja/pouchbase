import type { RequestHandler } from './$types';

import { json, preflight } from '#lib/server/api.js';

/**
 * Realtime events of records, over a WebSocket: `GET /api/realtime?collection=<name>` with
 * `Upgrade: websocket` (protocol: `src/lib/realtime/protocol.ts`). SvelteKit can't answer an
 * upgrade, so the server entry hands it to the realtime hub before it gets here:
 * `scripts/worker-entry.mjs` on Workers, `server.mjs` on Node and `vite/realtime.ts` in development.
 * This route only answers requests that aren't upgrades.
 */
export const GET: RequestHandler = () =>
	json(
		{
			message: 'Connect with a WebSocket: GET /api/realtime?collection=<name>, Upgrade: websocket'
		},
		426
	);

export const OPTIONS: RequestHandler = () => preflight();
