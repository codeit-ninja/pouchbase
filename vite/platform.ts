import type { Plugin } from 'vite';

export type Target = 'cloudflare' | 'node';

/**
 * Runtime-specific modules for the build target. The data always lives on Cloudflare, but the
 * Worker's bindings, SMTP connections and the realtime hub depend on the runtime:
 * `src/lib/server/platform/runtime/index.ts`, `src/lib/server/mail/socket/index.ts` and
 * `src/lib/server/realtime/broker/index.ts` re-export `./node`, which `vite dev` and the Node target
 * use; the Worker build resolves it to `./workers` (`cloudflare:workers`, `cloudflare:sockets`, and
 * the `RealtimeHub` Durable Object).
 */
export function platform(target: Target): Plugin {
	const swapped = [
		/[\\/]src[\\/]lib[\\/]server[\\/]platform[\\/]runtime[\\/]index\.ts$/,
		/[\\/]src[\\/]lib[\\/]server[\\/]mail[\\/]socket[\\/]index\.ts$/,
		/[\\/]src[\\/]lib[\\/]server[\\/]realtime[\\/]broker[\\/]index\.ts$/
	];
	let build = false;

	return {
		name: 'pouchbase:platform',
		enforce: 'pre',
		configResolved(config) {
			build = config.command === 'build';
		},
		resolveId(source, importer) {
			if (
				target === 'cloudflare' &&
				build &&
				source === './node' &&
				importer &&
				swapped.some((pattern) => pattern.test(importer))
			) {
				return this.resolve('./workers', importer, { skipSelf: true });
			}

			// Runtime modules of Workers (`cloudflare:sockets`), provided by workerd. Not
			// `cloudflare:workers`: adapter-cloudflare resolves that one to a stub Node can load while
			// SvelteKit analyses the build, and puts the real module back afterwards.
			if (
				target === 'cloudflare' &&
				source.startsWith('cloudflare:') &&
				source !== 'cloudflare:workers'
			) {
				return { id: source, external: true };
			}

			return null;
		}
	};
}
