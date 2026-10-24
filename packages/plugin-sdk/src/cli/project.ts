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
import { unknownCategoryIssues } from '../categories.js';
import {
	MANIFEST_FILE,
	UI_DIR,
	parseManifest,
	withPackageDefaults,
	type PackageJson
} from '../manifest.js';
import { isHostModule } from '../ui.js';

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

/** Static imports, re-exports and dynamic imports. */
const IMPORT =
	/(?:\bimport|\bexport)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;

/** Source files in `ui/`; TypeScript is turned into JavaScript in the bundle. */
const UI_SOURCE = /\.(?:svelte|ts|js|css|json|svg)$/;

function toPosix(path: string) {
	return path.split(sep).join('/');
}

async function listFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
}

/** The plugin's `package.json`, or `{}` when there is none. */
async function loadPackageJson(root: string): Promise<PackageJson> {
	let text: string;

	try {
		text = await readFile(join(root, 'package.json'), 'utf8');
	} catch {
		return {};
	}

	try {
		const json: unknown = JSON.parse(text);

		return json && typeof json === 'object' ? (json as PackageJson) : {};
	} catch (error) {
		throw new ProjectError(`Can't read package.json: ${(error as Error).message}`);
	}
}

/** Reads and checks the manifest, with the fields it leaves out taken from `package.json`. */
export async function loadManifest(root: string): Promise<PluginManifest> {
	let json: unknown;

	try {
		json = JSON.parse(await readFile(join(root, MANIFEST_FILE), 'utf8'));
	} catch (error) {
		throw new ProjectError(`Can't read ${MANIFEST_FILE}: ${(error as Error).message}`);
	}

	const result = parseManifest(
		json && typeof json === 'object' && !Array.isArray(json)
			? withPackageDefaults(json as Record<string, unknown>, await loadPackageJson(root))
			: json
	);

	if (!result.success) {
		throw new ProjectError(`${MANIFEST_FILE} is not valid`, result.issues);
	}

	// Hosts accept any category that matches the pattern; the registry only lists known ones.
	const unknown = unknownCategoryIssues(result.manifest.categories);

	if (unknown.length) {
		throw new ProjectError(`${MANIFEST_FILE} is not valid`, unknown);
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
		} else if (!isHostModule(specifier)) {
			issues.push({
				path,
				message: `Imports ${specifier}; UI files may only import svelte, @pouchbasejs/plugin-sdk/ui, @pouchbasejs/ui and files in ${UI_DIR}/`
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

const ROUTE_KEY = /^(?:GET|POST|PUT|PATCH|DELETE) \/\S*$/;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Loads the bundled server code and checks its default export against the manifest: every auth
 * provider has a complete handler, every handler has a contribution, and route keys look like
 * `GET /path`. Field types may go without a handler (they then accept every value). When the code
 * can't be loaded here, e.g. because it needs an API that only the sandbox has, that's a warning.
 */
export async function checkServer(
	manifest: PluginManifest,
	code: string
): Promise<{ issues: ManifestIssue[]; warnings: ManifestIssue[] }> {
	const entry = manifest.server ?? SERVER_FILE;
	const issues: ManifestIssue[] = [];
	let definition: unknown;

	try {
		const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
		const loaded = (await import(/* @vite-ignore */ url)) as { default?: unknown };

		definition = loaded.default;
	} catch (error) {
		return {
			issues,
			warnings: [
				{
					path: entry,
					message: `Can't load the server code to check its handlers: ${(error as Error).message}`
				}
			]
		};
	}

	if (!isObject(definition)) {
		issues.push({ path: entry, message: 'Must default-export definePlugin({ ... })' });

		return { issues, warnings: [] };
	}

	const { fields, authProviders, routes } = definition;

	for (const [name, value] of [
		['fields', fields],
		['authProviders', authProviders],
		['routes', routes]
	] as const) {
		if (value !== undefined && !isObject(value)) {
			issues.push({ path: entry, message: `${name} must be an object` });
		}
	}

	const handlers = {
		fields: isObject(fields) ? fields : {},
		authProviders: isObject(authProviders) ? authProviders : {}
	};

	manifest.contributes.authProviders.forEach((provider, index) => {
		const handler = handlers.authProviders[provider.id];
		const path = `contributes.authProviders.${index}`;

		if (!isObject(handler)) {
			issues.push({ path, message: `No handler: add authProviders.${provider.id} to ${entry}` });

			return;
		}

		const problems = [
			typeof handler.authorizeUrl === 'string' ? null : 'authorizeUrl',
			typeof handler.tokenUrl === 'string' ? null : 'tokenUrl',
			Array.isArray(handler.scopes) ? null : 'scopes',
			typeof handler.pkce === 'boolean' ? null : 'pkce',
			typeof handler.profile === 'function' ? null : 'profile'
		].filter((problem) => problem !== null);

		if (problems.length) {
			issues.push({
				path,
				message: `The handler in ${entry} lacks ${problems.join(', ')}`
			});
		}
	});

	for (const [key, ids] of [
		['fields', new Set(manifest.contributes.fields.map((field) => field.type))],
		['authProviders', new Set(manifest.contributes.authProviders.map((provider) => provider.id))]
	] as const) {
		for (const id of Object.keys(handlers[key])) {
			if (!ids.has(id)) {
				issues.push({
					path: entry,
					message: `${key}.${id} has no contribution in contributes.${key} of ${MANIFEST_FILE}`
				});
			}
		}
	}

	if (isObject(routes)) {
		for (const [key, handler] of Object.entries(routes)) {
			if (!ROUTE_KEY.test(key)) {
				issues.push({
					path: entry,
					message: `routes["${key}"]: use a method and a path, e.g. "GET /stats"`
				});
			} else if (typeof handler !== 'function') {
				issues.push({ path: entry, message: `routes["${key}"] must be a function` });
			}
		}
	}

	return { issues, warnings: [] };
}

/** Validates the project and builds its bundle; `warnings` are problems that don't stop it. */
export async function buildBundle(root: string): Promise<{
	bundle: PluginBundle;
	bytes: Uint8Array<ArrayBuffer>;
	warnings: ManifestIssue[];
}> {
	const manifest = await loadManifest(root);
	const files = await collectUi(root);
	const warnings: ManifestIssue[] = [];

	if (manifest.server) {
		const code = await bundleServer(root, manifest.server);
		const result = await checkServer(manifest, code);

		if (result.issues.length) {
			throw new ProjectError('The server code does not match the manifest', result.issues);
		}

		warnings.push(...result.warnings);
		files[SERVER_FILE] = code;
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

	return { bundle: result.bundle, bytes, warnings };
}

/** File name of a built bundle, e.g. `color-picker-1.0.0.json`. */
export function bundleFileName(manifest: PluginManifest) {
	return `${manifest.id}-${manifest.version}.json`;
}
