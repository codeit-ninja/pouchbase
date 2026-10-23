import { env, waitUntil } from 'cloudflare:workers';

/** The bindings of the running Worker (D1, the realtime Durable Objects, secrets, ...). */
export function workerEnv(): Record<string, unknown> | null {
	return env as unknown as Record<string, unknown>;
}

/** Keeps the Worker running until `promise` settles, after the response was sent. */
export function background(promise: Promise<unknown>) {
	waitUntil(
		promise.catch((error: unknown) => {
			console.error('[pouchbase] background work failed', error);
		})
	);
}
