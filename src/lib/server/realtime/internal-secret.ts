/**
 * The secret that the realtime hubs send to `/internal/realtime/*`. The hubs never call those
 * routes over the network: the Durable Object runs the app's handler in its own isolate, and the
 * Node hub calls the server it runs in over loopback. So caller and route share `globalThis`, and a
 * random secret per isolate (or process) is enough; no request from outside can know it.
 *
 * Only relative imports: the Worker bundles this file outside of Vite (`scripts/worker-entry.mjs`).
 */

const KEY = Symbol.for('pouchbase.realtime.secret');

type WithSecret = typeof globalThis & { [KEY]?: string };

export function internalSecret(): string {
	const scope = globalThis as WithSecret;

	scope[KEY] ??= `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');

	return scope[KEY];
}

/** Whether `header` is `Bearer <secret>`, compared in constant time. */
export function isInternalRequest(header: string | null): boolean {
	const expected = `Bearer ${internalSecret()}`;

	if (!header || header.length !== expected.length) {
		return false;
	}

	let difference = 0;

	for (let index = 0; index < expected.length; index++) {
		difference |= header.charCodeAt(index) ^ expected.charCodeAt(index);
	}

	return difference === 0;
}
