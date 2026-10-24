import type { PackageJson, PluginManifest } from '@pouchbasejs/plugin-sdk';
import type { PluginDefinition } from '@pouchbasejs/plugin-sdk/server';
import type { DescribeResult, PluginCall, PluginCallContext, PluginRuntime } from './runtime';

import { MANIFEST_FILE, parseManifest, withPackageDefaults } from '@pouchbasejs/plugin-sdk';

import { restrictedFetch } from './network';
import {
	CALL_TIMEOUT,
	describePlugin,
	dispatch,
	EMPTY_CALL_CONTEXT,
	pluginContext,
	withTimeout
} from './runtime';

/**
 * Built-in plugins: the first-party plugins in `plugins/*` of this repository, bundled into
 * Pouchbase at build time with `import.meta.glob` (paths are from the repository root, which is
 * the Vite root). They ship with the app, so their `engines` range is not checked, and they can't
 * be removed. Their server code runs inside Pouchbase (`InProcessRuntime`), with the same
 * `ctx.fetch` allowlist as an installed plugin. Installing the same plugin id from the registry
 * shadows the built-in one.
 */

/** A module whose default export is `definePlugin(...)`. */
type ServerModule = { default?: PluginDefinition };

/** What the globs below find, keyed by path from the repository root. */
export type EmbeddedSources = {
	manifests: Record<string, unknown>;
	packages: Record<string, PackageJson>;
	servers: Record<string, () => Promise<ServerModule>>;
	/** `ui/*.svg` files, as text. */
	assets: Record<string, string>;
};

export type EmbeddedPlugin = {
	manifest: PluginManifest;
	/** Path in the plugin (`ui/google.svg`) → contents. */
	assets: Record<string, string>;
	/** Imports the server code; `undefined` without one. */
	load(): Promise<PluginDefinition | undefined>;
};

export type EmbeddedIssue = { dir: string; message: string };

const GLOBS: EmbeddedSources = {
	manifests: import.meta.glob('/plugins/*/pouchbase-plugin.json', {
		eager: true,
		import: 'default'
	}),
	packages: import.meta.glob<PackageJson>('/plugins/*/package.json', {
		eager: true,
		import: 'default'
	}),
	servers: import.meta.glob<ServerModule>('/plugins/*/server/**/*.{ts,js,mjs}'),
	assets: import.meta.glob<string>('/plugins/*/ui/**/*.svg', {
		query: '?raw',
		import: 'default',
		eager: true
	})
};

/** Reads the built-in plugins from what the globs found; invalid ones are left out as issues. */
export function loadEmbeddedPlugins(sources: EmbeddedSources): {
	plugins: EmbeddedPlugin[];
	issues: EmbeddedIssue[];
} {
	const plugins: EmbeddedPlugin[] = [];
	const issues: EmbeddedIssue[] = [];

	for (const [path, raw] of Object.entries(sources.manifests).sort(([a], [b]) =>
		a.localeCompare(b)
	)) {
		const dir = path.slice(0, -`/${MANIFEST_FILE}`.length);
		const pkg = sources.packages[`${dir}/package.json`] ?? {};
		const result = parseManifest(
			withPackageDefaults(
				typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : {},
				pkg
			)
		);

		if (!result.success) {
			const issue = result.issues[0];

			issues.push({
				dir,
				message: `Invalid manifest${issue ? `: ${issue.path ? `${issue.path}: ` : ''}${issue.message}` : ''}`
			});
			continue;
		}

		const { manifest } = result;

		if (plugins.some((plugin) => plugin.manifest.id === manifest.id)) {
			issues.push({ dir, message: `Duplicate plugin id: ${manifest.id}` });
			continue;
		}

		const loader = manifest.server ? sources.servers[`${dir}/${manifest.server}`] : undefined;

		if (manifest.server && !loader) {
			issues.push({ dir, message: `Missing server code: ${manifest.server}` });
			continue;
		}

		const assets = Object.fromEntries(
			Object.entries(sources.assets)
				.filter(([key]) => key.startsWith(`${dir}/`))
				.map(([key, content]) => [key.slice(dir.length + 1), content])
		);
		const missing = manifest.contributes.authProviders
			.flatMap((provider) => provider.icon ?? [])
			.filter((icon) => !(icon in assets));

		if (missing.length) {
			issues.push({ dir, message: `Missing file: ${missing[0]}` });
			continue;
		}

		let loaded: Promise<PluginDefinition | undefined> | undefined;

		plugins.push({
			manifest,
			assets,
			load() {
				if (!loader) {
					return Promise.resolve(undefined);
				}

				loaded ??= loader().then(
					(module) => module.default,
					(error) => {
						loaded = undefined;

						throw error;
					}
				);

				return loaded;
			}
		});
	}

	return { plugins, issues };
}

let cached: EmbeddedPlugin[] | undefined;

/** The built-in plugins of this build. */
export function embeddedPlugins(): EmbeddedPlugin[] {
	if (!cached) {
		const { plugins, issues } = loadEmbeddedPlugins(GLOBS);

		for (const issue of issues) {
			console.error(`[plugins] Skipping the built-in plugin in ${issue.dir}: ${issue.message}`);
		}

		cached = plugins;
	}

	return cached;
}

/** The built-in plugin with this id, or `null`. */
export function embeddedPlugin(id: string): EmbeddedPlugin | null {
	return embeddedPlugins().find((plugin) => plugin.manifest.id === id) ?? null;
}

/** Runs a built-in plugin's server code inside Pouchbase. */
export class InProcessRuntime implements PluginRuntime {
	constructor(
		private readonly plugin: EmbeddedPlugin,
		private readonly options: { timeout?: number; fetch?: typeof fetch } = {}
	) {}

	async call(call: PluginCall, context: PluginCallContext = EMPTY_CALL_CONTEXT): Promise<unknown> {
		const { manifest } = this.plugin;
		const ctx = pluginContext(
			manifest,
			context,
			restrictedFetch(manifest.permissions.network, this.options.fetch ?? fetch)
		);

		return withTimeout(
			this.plugin.load().then((definition) => dispatch(definition, call, ctx)),
			this.options.timeout ?? CALL_TIMEOUT
		);
	}
}

const descriptions = new Map<string, Promise<DescribeResult>>();

/** `describe` of a built-in plugin; it can't change within a build, so it is kept. */
export function describeEmbedded(plugin: EmbeddedPlugin): Promise<DescribeResult> {
	const { id } = plugin.manifest;
	let description = descriptions.get(id);

	if (!description) {
		description = describePlugin(new InProcessRuntime(plugin));
		description.catch(() => descriptions.delete(id));
		descriptions.set(id, description);
	}

	return description;
}
