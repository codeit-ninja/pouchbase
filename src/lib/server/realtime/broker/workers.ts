import type { RecordEvent } from '../hub-core.ts';

import { workerEnv } from '../../platform/runtime';

type Hub = { publish(events: RecordEvent[]): Promise<void> };
type HubNamespace = { getByName(name: string): Hub };

/** Sends saved changes of one collection to its Durable Object (`RealtimeHub`, RPC). */
export async function publish(events: RecordEvent[]) {
	// The generated `Env` doesn't know the class's methods (it lives outside the Vite build).
	const namespace = workerEnv()?.REALTIME as HubNamespace | undefined;

	if (!namespace || !events.length) {
		return;
	}

	await namespace.getByName(events[0].collection).publish(events);
}
