import type { ManifestIssue, PluginManifest } from '../manifest.js';

import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { rolldown } from 'rolldown';
import { transform } from 'rolldown/experimental';

import {
	BUNDLE_FORMAT,
	BUNDLE_VERSION,
	MAX_BUNDLE_SIZE,
	SERVER_FILE,
	parseBundle,
	serializeBundle,
	type PluginBundle
} from '../bundle.js';
import { MANIFEST_FILE, UI_DIR, parseManifest } from '../manifest.js';

/** Loading, checking and building a plugin project on disk. Functions throw `ProjectError`. */

export class ProjectError extends Error {
	override name = 'ProjectError';

	constructor(
		message: string,
		readonly issues: ManifestIssue[] = []
	) {
		super(message);
	}
}

/** Modules a UI file may import besides files in `ui/`. */
const UI_PACKAGES = /^(?:svelte(?:\/.*)?|@pouchbasejs\/plugin-sdk\/ui)$/;

/** Static imports, re-exports and dynamic imports. */
const IMPORT =
	/(?:\bimport|\bexport)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;

/** Source files in `ui/`; TypeScript is turned into JavaScript in the bundle. */
const UI_SOURCE = /\.(?:svelte|ts|js|css|json)$/;

function toPosix(path: string) {
	return path.split(sep).join('/');
}

async function listFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
}

export async function loadManifest(root: string): Promise<PluginManifest> {
	let json: unknown;

	try {
		json = JSON.parse(await readFile(join(root, MANIFEST_FILE), 'utf8'));
	} catch (error) {
		throw new ProjectError(`Can't read ${MANIFEST_FILE}: ${(error as Error).message}`);
	}

	const result = parseManifest(json);

	if (!result.success) {
		throw new ProjectError(`${MANIFEST_FILE} is not valid`, result.issues);
	}

	return result.manifest;
}

/** Problems with the imports of a UI file. */
function checkImports(path: string, source: string): ManifestIssue[] {
	const issues: ManifestIssue[] = [];

	for (const match of source.matchAll(IMPORT)) {
		const specifier = match[1] ?? match[2] ?? '';

		if (specifier.startsWith('.')) {
			const target = posix.normalize(posix.join(posix.dirname(path), specifier));

			if (!target.startsWith(`${UI_DIR}/`)) {
				issues.push({ path, message: `Imports ${specifier}, which is outside ${UI_DIR}/` });
			}
		} else if (!UI_PACKAGES.test(specifier)) {
			issues.push({
				path,
				message: `Imports ${specifier}; UI files may only import svelte, @pouchbasejs/plugin-sdk/ui and files in ${UI_DIR}/`
			});
		}
	}

	return issues;
}

/** The `ui/` files of the bundle: path → contents, with TypeScript modules turned into `.js`. */
async function collectUi(root: string): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	const issues: ManifestIssue[] = [];

	for (const file of await listFiles(join(root, UI_DIR))) {
		const path = toPosix(relative(root, file));

		if (!UI_SOURCE.test(path) || path.endsWith('.d.ts')) {
			continue;
		}

		const source = await readFile(file, 'utf8');

		if (/\.(?:svelte|ts|js)$/.test(path)) {
			issues.push(...checkImports(path, source));
		}

		if (path.endsWith('.ts')) {
			const result = await transform(path, source, { lang: 'ts' });

			if (result.errors.length) {
				issues.push(...result.errors.map((error) => ({ path, message: error.message })));
				continue;
			}

			files[path.replace(/\.ts$/, '.js')] = result.code;
		} else {
			files[path] = source;
		}
	}

	if (issues.length) {
		throw new ProjectError(`Problems in ${UI_DIR}/`, issues);
	}

	return files;
}

/** The server entry bundled into one ES module without imports. */
async function bundleServer(root: string, entry: string): Promise<string> {
	let code: string;
	let imports: string[];

	try {
		const build = await rolldown({
			input: join(root, entry),
			platform: 'neutral',
			logLevel: 'silent'
		});
		const { output } = await build.generate({ format: 'esm', minify: true });
		await build.close();

		code = output[0].code;
		imports = [...output[0].imports, ...output[0].dynamicImports];
	} catch (error) {
		throw new ProjectError(`Can't bundle ${entry}: ${(error as Error).message}`);
	}

	if (imports.length) {
		throw new ProjectError(
			`The server code imports ${imports.join(', ')}; it runs in a sandbox without Node.js or other modules`
		);
	}

	return code;
}

/** Validates the project and builds its bundle. */
export async function buildBundle(root: string): Promise<{
	bundle: PluginBundle;
	bytes: Uint8Array<ArrayBuffer>;
}> {
	const manifest = await loadManifest(root);
	const files = await collectUi(root);

	if (manifest.server) {
		files[SERVER_FILE] = await bundleServer(root, manifest.server);
	}

	const draft = {
		format: BUNDLE_FORMAT,
		bundleVersion: BUNDLE_VERSION,
		manifest: { ...manifest, server: manifest.server ? SERVER_FILE : undefined },
		files
	} satisfies PluginBundle;
	const bytes = serializeBundle(draft);

	if (bytes.byteLength > MAX_BUNDLE_SIZE) {
		throw new ProjectError(
			`The bundle is ${Math.ceil(bytes.byteLength / 1024)} KiB; the limit is ${MAX_BUNDLE_SIZE / 1024} KiB`
		);
	}

	// The same check a host does on install, e.g. for components that don't exist.
	const result = parseBundle(bytes);

	if (!result.success) {
		throw new ProjectError('The bundle is not valid', result.issues);
	}

	return { bundle: result.bundle, bytes };
}

/** File name of a built bundle, e.g. `color-picker-1.0.0.json`. */
export function bundleFileName(manifest: PluginManifest) {
	return `${manifest.id}-${manifest.version}.json`;
}
