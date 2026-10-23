/**
 * Builds Pouchbase as a single executable for the current platform, like PocketBase:
 * `pnpm build:binary` (which runs `pnpm build:node` first) writes `dist/pouchbase-<os>-<arch>`.
 * Requires Node 26; the binary contains that same Node runtime (a Node single executable
 * application, https://nodejs.org/api/single-executable-applications.html).
 *
 * 1. `server.mjs` and the Node build are bundled with rolldown into one ESM file. The WASM of
 *    `@cf-wasm/photon` and `@cf-wasm/quickjs` is inlined in their Node builds, so nothing is read
 *    from `node_modules` at runtime.
 * 2. The static files in `build/client` are embedded as SEA assets (`client/<path>`). The
 *    adapter-node handler serves a fixed set of files with `fs.createReadStream(<dir>/client/...)`;
 *    in the bundle `dir` is a virtual path and the handler's `node:fs` is swapped for a shim that
 *    reads those paths from the assets.
 * 3. `node --build-sea` writes the executable; on macOS it is signed ad hoc afterwards.
 *
 * Code cache and snapshots are left off: the bundle is an ES module, which snapshots don't support.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { rolldown } from 'rolldown';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const work = join(dist, '.sea');

const major = Number(process.versions.node.split('.')[0]);

if (major < 26) {
	console.error(
		`Building the binary requires Node 26 or later, this is Node ${process.versions.node}.`
	);
	process.exit(1);
}

const platform = { win32: 'windows', darwin: 'macos' }[process.platform] ?? process.platform;
const output = join(
	dist,
	`pouchbase-${platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`
);

/** Path prefix of the embedded files, as the handler sees them (`<dir>/client/...`). */
const VIRTUAL_DIR = '/$pouchbase';
const SEA_FS = '\0pouchbase:sea-fs';
const BROWSER_ONLY = '\0pouchbase:browser-only';

const seaFs = `
import fs from 'node:fs';
import { getRawAsset } from 'node:sea';
import { Readable } from 'node:stream';

const prefix = ${JSON.stringify(`${VIRTUAL_DIR}/`)};

export function createReadStream(path, options = {}) {
	// \`path.join\` in the handler uses backslashes on Windows.
	const normalized = String(path).replaceAll('\\\\', '/');

	if (!normalized.startsWith(prefix)) {
		return fs.createReadStream(path, options);
	}

	const data = Buffer.from(getRawAsset(normalized.slice(prefix.length)));
	const end = options.end === undefined ? data.length : options.end + 1;

	return Readable.from([data.subarray(options.start ?? 0, end)]);
}

export default { ...fs, createReadStream };
`;

/**
 * Monaco only runs in the browser (`code-monaco.ts`), but its dynamic import stays in the Node build
 * because `monaco-editor` is a dependency. The server never loads it, and rolldown can't bundle its
 * CSS, so it becomes an empty module.
 */
const browserOnly = {
	name: 'pouchbase:browser-only',
	resolveId(source) {
		return /^monaco-editor(\/|$)/.test(source) ? BROWSER_ONLY : null;
	},
	load(id) {
		return id === BROWSER_ONLY ? 'export default {};' : null;
	}
};

/** Swaps the handler's static file access for the embedded assets (see the top of this file). */
const embedStatic = {
	name: 'pouchbase:embed-static',
	resolveId(source, importer) {
		if (source === 'node:fs' && importer && /adapter-node-handler\.js$/.test(importer)) {
			return SEA_FS;
		}

		return null;
	},
	load(id) {
		return id === SEA_FS ? seaFs : null;
	},
	transform(code, id) {
		if (!/[\\/]build[\\/]adapter-node\.js$/.test(id)) {
			return null;
		}

		const dir = 'export const dir = dirname(fileURLToPath(import.meta.url));';

		if (!code.includes(dir)) {
			throw new Error('build/adapter-node.js changed: `dir` not found, update build-binary.mjs');
		}

		return code.replace(dir, `export const dir = ${JSON.stringify(VIRTUAL_DIR)};`);
	}
};

function files(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

console.log('Bundling server.mjs and the Node build');

const bundle = await rolldown({
	input: join(root, 'server.mjs'),
	platform: 'node',
	plugins: [browserOnly, embedStatic],
	logLevel: 'warn'
});

await bundle.write({
	file: join(work, 'pouchbase.mjs'),
	format: 'esm',
	codeSplitting: false
});

await bundle.close();

const client = join(root, 'build', 'client');
const assets = Object.fromEntries(
	files(client).map((file) => [`client/${relative(client, file).split(sep).join('/')}`, file])
);

console.log(`Embedding ${Object.keys(assets).length} static files`);

const config = join(work, 'sea-config.json');

writeFileSync(
	config,
	JSON.stringify(
		{
			main: join(work, 'pouchbase.mjs'),
			mainFormat: 'module',
			output,
			disableExperimentalSEAWarning: true,
			assets
		},
		null,
		'\t'
	)
);

console.log(`Writing ${relative(root, output)}`);

execFileSync(process.execPath, ['--build-sea', config], { stdio: 'inherit' });

if (process.platform === 'darwin') {
	execFileSync('codesign', ['--sign', '-', output], { stdio: 'inherit' });
}

rmSync(work, { recursive: true, force: true });
