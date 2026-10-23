import type { Runtime } from '#lib/updates.js';

import { dev } from '$app/env';

/**
 * What `server.mjs` tells the app about the process it runs in (Node, Docker and the single
 * binary), on `globalThis[Symbol.for('pouchbase.runtime')]`. Only the binary can update itself.
 */
export interface NodeRuntime {
	kind: 'binary' | 'docker' | 'node';
	/** Replaces the binary with the latest release; the version it installed, or `null` if none. */
	update?: () => Promise<string | null>;
	/** Restarts the server so it runs the replaced binary. */
	restart?: () => void;
}

const key = Symbol.for('pouchbase.runtime');

export function nodeRuntime(): NodeRuntime | null {
	return ((globalThis as Record<symbol, unknown>)[key] as NodeRuntime | undefined) ?? null;
}

/** Where this instance runs. */
export function runtime(): Runtime {
	if (dev) {
		return 'dev';
	}

	if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') {
		return 'workers';
	}

	return nodeRuntime()?.kind ?? 'node';
}
