import type { RecordEvent } from '../hub-core.ts';

import { nodeHub } from '../node-hub.ts';

// Made when the app loads, so `server.mjs` finds the hub for the first upgrade.
nodeHub();

/** Sends saved changes of one collection to its hub. */
export async function publish(events: RecordEvent[]) {
	await nodeHub().publish(events);
}
