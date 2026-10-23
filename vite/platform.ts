import type { Plugin } from 'vite';

export type Target = 'cloudflare' | 'node';

/**
 * Runtime-specific modules for the build target. The data always lives on Cloudflare, but SMTP
 * connections depend on the runtime: `src/lib/server/mail/socket/index.ts` re-exports `./node`,
 * which `vite dev` and the Node target use; the Worker build resolves it to `./workers`
 * (`cloudflare:sockets`).
 */
export function platform(target: Target): Plugin {
	const socket = /[\\/]src[\\/]lib[\\/]server[\\/]mail[\\/]socket[\\/]index\.ts$/;
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
				socket.test(importer)
			) {
				return this.resolve('./workers', importer, { skipSelf: true });
			}

			// Runtime modules of Workers (`cloudflare:sockets`), provided by workerd.
			if (target === 'cloudflare' && source.startsWith('cloudflare:')) {
				return { id: source, external: true };
			}

			return null;
		}
	};
}
