import { dev } from '$app/env';

import { workerEnv as runtimeEnv } from '../runtime';
import { cloudflareFetch, failure } from './api';
import { WORKER_NAME } from './insights';

/**
 * D1 bindings that the deployed Worker adds to itself. The databases are created during
 * installation, so they can't be in `wrangler.jsonc`; instead the Worker adds a binding per
 * database to its own settings, which deploys a new version. Queries go through a binding when
 * the running version has one and through the REST API otherwise: in development, on Node, right
 * after installing and after a deploy that replaced the bindings (they are added again then).
 */

interface WorkerBinding {
	type: string;
	name: string;
}

// Adding bindings is tried once per isolate; isolates of the new version start with them.
let attempted = false;

/**
 * The binding name of a database. It is derived from the database id, so a binding always points
 * at the database its name says.
 */
export function bindingName(databaseId: string) {
	return `D1_${databaseId.replace(/-/g, '_').toUpperCase()}`;
}

/**
 * The bindings of the running Worker, or `null` when this isn't the deployed Worker. In `vite dev`
 * the platform emulation would hand out local databases under the same names, so it is skipped.
 */
function workerEnv(): Record<string, unknown> | null {
	if (dev || typeof navigator === 'undefined' || navigator.userAgent !== 'Cloudflare-Workers') {
		return null;
	}

	return runtimeEnv();
}

/** The D1 binding of this database, or `null` when the running Worker has none (yet). */
export function d1Binding(databaseId: string): D1Database | null {
	return (workerEnv()?.[bindingName(databaseId)] as D1Database | undefined) ?? null;
}

/**
 * Adds D1 bindings for these databases to the deployed Worker, keeping its other bindings
 * (assets, secrets, variables) through `inherit`. Does nothing outside the deployed Worker, when
 * the running version has the bindings, or when a newer version already has them. Throws on API
 * errors.
 */
export async function attachBindings(databaseIds: string[]) {
	const env = workerEnv();

	if (!env || attempted || databaseIds.every((id) => env[bindingName(id)])) {
		return;
	}

	attempted = true;

	const path = `/workers/scripts/${encodeURIComponent(WORKER_NAME)}/settings`;
	const response = await cloudflareFetch(path);

	// The Worker finds itself by the instance name. Deployed under another name, it can't add its
	// bindings and every query keeps going through the REST API, which is slow and makes a first
	// install run into the Worker's subrequest limit.
	if (response.status === 404) {
		console.warn(
			`[pouchbase] There is no Worker named "${WORKER_NAME}" (POUCHBASE_INSTANCE) on the account, so this Worker can't add its D1 bindings and every query goes through the slower REST API. Deploy it under the instance name: wrangler deploy --name ${WORKER_NAME} --var POUCHBASE_INSTANCE:${WORKER_NAME}`
		);

		return;
	}

	if (!response.ok) {
		throw await failure(response);
	}

	const { result } = (await response.json()) as { result: { bindings?: WorkerBinding[] } };
	const current = result.bindings ?? [];
	const names = new Set(current.map((binding) => binding.name));
	const missing = databaseIds.filter((id) => !names.has(bindingName(id)));

	if (!missing.length) {
		return;
	}

	const settings = {
		bindings: [
			...current.map(({ name }) => ({ type: 'inherit', name })),
			...missing.map((id) => ({ type: 'd1', name: bindingName(id), id }))
		]
	};
	const body = new FormData();
	body.set('settings', new Blob([JSON.stringify(settings)], { type: 'application/json' }));

	const patched = await cloudflareFetch(path, { method: 'PATCH', body });

	if (!patched.ok) {
		throw await failure(patched);
	}

	console.log(
		`[pouchbase] Added D1 bindings to the Worker: ${missing.map(bindingName).join(', ')}`
	);
}
