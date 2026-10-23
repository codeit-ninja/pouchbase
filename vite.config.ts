import type { Target } from './vite/platform.ts';

import { icons as lucide } from '@iconify-json/lucide';
import { icons as logos } from '@iconify-json/logos';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@sveltejs/adapter-cloudflare';
import node from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { iconify } from './vite/iconify.ts';
import { platform } from './vite/platform.ts';

/**
 * Pouchbase builds for two targets, chosen with `POUCHBASE_TARGET` (from the environment or `.env`):
 *
 * - `cloudflare` (default): a Worker with D1 and R2, built with `@sveltejs/adapter-cloudflare`.
 * - `node`: a standalone Node server, built with `@sveltejs/adapter-node`. This is what the Docker
 *   image runs. The data still lives on Cloudflare (D1 and R2).
 */
export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
	const target: Target = env.POUCHBASE_TARGET === 'node' ? 'node' : 'cloudflare';

	return {
		plugins: [
			platform(target),
			iconify({ sets: [lucide, logos] }),
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
					experimental: {
						async: true
					}
				},
				experimental: {
					remoteFunctions: true
				},
				adapter: target === 'node' ? node() : cloudflare()
			})
		]
	};
});
