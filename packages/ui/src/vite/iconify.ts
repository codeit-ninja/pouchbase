import type { IconifyJSON } from '@iconify/types';
import type { Plugin, ViteDevServer } from 'vite';

import { getIcons } from '@iconify/utils';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bundles only the Iconify icons that are used in the host's sources and in the components of
 * `@pouchbasejs/ui`, so icons render during SSR and are never fetched from the Iconify API at runtime.
 *
 * Exposes `virtual:iconify`, which registers the used icons with `@iconify/svelte`'s `addCollection`.
 * The host imports it once (e.g. in its root layout). Icons are found by scanning source files for
 * `"<prefix>:<name>"` (e.g. `icon="lucide:plus"`) for every configured prefix, so icon names must
 * appear literally in the source.
 */

const VIRTUAL_ID = 'virtual:iconify';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const SOURCE_FILE = /\.(svelte|ts|js)$/;

/** The components of this package (`src/components` in the sources, `dist/components` when published). */
const COMPONENTS_DIR = fileURLToPath(new URL('../components', import.meta.url));

export interface IconifyOptions {
	/** Icon sets to bundle from, e.g. `icons` from `@iconify-json/lucide`. */
	sets: IconifyJSON[];
	/** Directories to scan for icon names, relative to the working directory. Defaults to `['src']`. */
	srcDirs?: string[];
}

/** Normalizes a path for comparison with the (forward slash) paths Vite reports. */
function normalize(path: string) {
	return resolve(path).replaceAll('\\', '/').toLowerCase();
}

function sourceFiles(dir: string): string[] {
	if (!existsSync(dir)) {
		return [];
	}

	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) {
			return sourceFiles(path);
		}

		return SOURCE_FILE.test(entry.name) ? [path] : [];
	});
}

export function iconify(options: IconifyOptions): Plugin {
	const dirs = [...(options.srcDirs ?? ['src']), COMPONENTS_DIR];
	const watched = dirs.map((dir) => `${normalize(dir)}/`);
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

		for (const file of dirs.flatMap(sourceFiles)) {
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
			const path = normalize(file);

			if (!SOURCE_FILE.test(file) || !watched.some((dir) => path.startsWith(dir))) {
				return;
			}

			if (hasNewIcons(await read())) {
				scan();
				reload(server);
			}
		}
	};
}
