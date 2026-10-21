import type { IconifyJSON } from '@iconify/types';
import type { Plugin, ViteDevServer } from 'vite';

import { getIcons } from '@iconify/utils';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bundles only the Iconify icons that are used in `src`, so icons render during SSR and are never
 * fetched from the Iconify API at runtime.
 *
 * Exposes `virtual:iconify`, which registers the used icons with `@iconify/svelte`'s `addCollection`.
 * Icons are found by scanning source files for `"<prefix>:<name>"` (e.g. `icon="lucide:plus"`) for
 * every configured prefix.
 */

const VIRTUAL_ID = 'virtual:iconify';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const SOURCE_FILE = /\.(svelte|ts|js)$/;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) {
			return sourceFiles(path);
		}

		return SOURCE_FILE.test(entry.name) ? [path] : [];
	});
}

export function iconify(options: { sets: IconifyJSON[]; srcDir?: string }): Plugin {
	const srcDir = options.srcDir ?? 'src';
	const prefixes = options.sets.map((set) => set.prefix);
	const pattern = new RegExp(`["'\`](${prefixes.join('|')}):([a-z0-9]+(?:-[a-z0-9]+)*)["'\`]`, 'g');

	/** prefix → used icon names */
	let used = new Map<string, Set<string>>();

	function collect(code: string, into: Map<string, Set<string>>) {
		for (const [, prefix, name] of code.matchAll(pattern)) {
			if (!into.has(prefix)) {
				into.set(prefix, new Set());
			}

			into.get(prefix)!.add(name);
		}
	}

	function scan() {
		used = new Map();

		for (const file of sourceFiles(srcDir)) {
			collect(readFileSync(file, 'utf-8'), used);
		}
	}

	function hasNewIcons(code: string) {
		const found = new Map<string, Set<string>>();
		collect(code, found);

		return [...found].some(([prefix, names]) =>
			[...names].some((name) => !used.get(prefix)?.has(name))
		);
	}

	function reload(server: ViteDevServer) {
		for (const env of Object.values(server.environments)) {
			const module = env.moduleGraph.getModuleById(RESOLVED_ID);

			if (module) {
				env.moduleGraph.invalidateModule(module);
			}
		}

		server.ws.send({ type: 'full-reload' });
	}

	return {
		name: 'pouchbase:iconify',

		buildStart() {
			scan();
		},

		resolveId(id) {
			return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
		},

		load(id) {
			if (id !== RESOLVED_ID) {
				return;
			}

			const collections = options.sets
				.map((set) => getIcons(set, [...(used.get(set.prefix) ?? [])]))
				.filter((set) => set && Object.keys(set.icons).length);

			return [
				`import { addCollection } from '@iconify/svelte';`,
				...collections.map((set) => `addCollection(${JSON.stringify(set)});`)
			].join('\n');
		},

		// A newly used icon (dev) means the virtual module has to be rebuilt.
		async hotUpdate({ file, read, server }) {
			if (!SOURCE_FILE.test(file) || !file.includes(srcDir)) {
				return;
			}

			if (hasNewIcons(await read())) {
				scan();
				reload(server);
			}
		}
	};
}
