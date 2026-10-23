/**
 * Runs after `vite build` for the Worker (`pnpm build`). adapter-cloudflare writes a Worker that
 * only handles `fetch`, at the `main` path of `wrangler.jsonc`. This moves it next to it as
 * `_sveltekit.js` and writes a Worker in its place that adds:
 *
 * - a `scheduled` handler: the Cron Trigger in `wrangler.jsonc` calls `POST /internal/tick` once a
 *   minute, which starts scheduled backups and continues running ones (see
 *   `src/routes/internal/tick/+server.ts`);
 * - realtime: the `RealtimeHub` Durable Object (`src/lib/server/realtime/durable-object.ts`, bundled
 *   by Wrangler) and the WebSocket upgrades of `/api/realtime`, which go to the hub of their
 *   collection before SvelteKit, because SvelteKit can't answer an upgrade.
 */
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const main = '.svelte-kit/cloudflare/_worker.js';
const directory = dirname(main);
const sveltekit = join(directory, '_sveltekit.js');

if (!existsSync(main)) {
	console.error(`${main} not found; run vite build first`);
	process.exit(1);
}

if (readFileSync(main, 'utf8').includes('pouchbase:worker-entry')) {
	console.log('Worker entry already written');
	process.exit(0);
}

renameSync(main, sveltekit);

writeFileSync(
	main,
	`// pouchbase:worker-entry, written by scripts/worker-entry.mjs
import worker from './_sveltekit.js';
import { realtimeHub } from '../../src/lib/server/realtime/durable-object.ts';

/** Keep in sync with COLLECTION_NAME_PATTERN in src/lib/schemas/collections.ts. */
const COLLECTION_NAME = /^[a-z][a-z0-9_]{0,62}$/;

export const RealtimeHub = realtimeHub(worker);

/** Keep in sync with src/routes/internal/tick/+server.ts. */
async function tickToken(apiToken) {
	const data = new TextEncoder().encode(\`pouchbase-tick:\${apiToken}\`);
	const digest = await crypto.subtle.digest('SHA-256', data);

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (
			url.pathname === '/api/realtime' &&
			request.headers.get('upgrade')?.toLowerCase() === 'websocket'
		) {
			const collection = url.searchParams.get('collection') ?? '';

			// Checked before it names a Durable Object, so no other names can create one.
			if (!COLLECTION_NAME.test(collection)) {
				return new Response('Invalid collection', { status: 400 });
			}

			return env.REALTIME.getByName(collection).fetch(request);
		}

		return worker.fetch(request, env, ctx);
	},

	async scheduled(controller, env, ctx) {
		const request = new Request('https://pouchbase.internal/internal/tick', {
			method: 'POST',
			// JSON, so SvelteKit doesn't take it for a cross-site form submission.
			headers: {
				authorization: \`Bearer \${await tickToken(env.CLOUDFLARE_API_TOKEN)}\`,
				'content-type': 'application/json'
			},
			body: '{}'
		});

		const response = await worker.fetch(request, env, ctx);

		if (!response.ok) {
			console.error(\`[tick] \${response.status} \${await response.text()}\`);
		}
	}
};
`
);

// The build directory is also the assets directory: never serve the SvelteKit Worker as a file.
appendFileSync(join(directory, '.assetsignore'), '\n_sveltekit.js\n');

console.log(`Wrote ${main} with a scheduled handler and the realtime hub`);
