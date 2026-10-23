import type { PluginManifestInput } from '../manifest.js';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { API_VERSION } from '../api-version.js';
import { MANIFEST_FILE, PLUGIN_ID_PATTERN } from '../manifest.js';
import { ProjectError } from './project.js';

/** `pouchbase-plugin init`: a new plugin with an example field type. */

async function sdkVersion() {
	const json = await readFile(new URL('../package.json', import.meta.url), 'utf8');

	return (JSON.parse(json) as { version: string }).version;
}

function title(id: string) {
	const words = id.split('-').join(' ');

	return words.charAt(0).toUpperCase() + words.slice(1);
}

function templates(id: string, sdk: string): Record<string, string> {
	const manifest: PluginManifestInput = {
		apiVersion: API_VERSION,
		id,
		name: title(id),
		version: '0.1.0',
		description: 'Adds a color field type.',
		license: 'MIT',
		server: 'server/index.ts',
		contributes: {
			fields: [
				{
					type: 'color',
					label: 'Color',
					description: 'A color as a hex code, e.g. #ff6600.',
					column: 'TEXT',
					input: 'ui/color-input.svelte',
					cell: 'ui/color-cell.svelte'
				}
			]
		}
	};

	return {
		[MANIFEST_FILE]: JSON.stringify(manifest, null, '\t'),
		'package.json': JSON.stringify(
			{
				name: id,
				version: '0.1.0',
				private: true,
				type: 'module',
				scripts: {
					dev: 'pouchbase-plugin dev',
					build: 'pouchbase-plugin build',
					release: 'pouchbase-plugin publish'
				},
				devDependencies: {
					'@pouchbasejs/plugin-sdk': `^${sdk}`,
					svelte: '^5.0.0',
					typescript: '^6.0.0'
				}
			},
			null,
			'\t'
		),
		'tsconfig.json': JSON.stringify(
			{
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					strict: true,
					verbatimModuleSyntax: true,
					skipLibCheck: true,
					noEmit: true
				},
				include: ['server', 'ui']
			},
			null,
			'\t'
		),
		'.gitignore': 'node_modules\ndist\n',
		'server/index.ts': `import { definePlugin } from '@pouchbasejs/plugin-sdk/server';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export default definePlugin({
	fields: {
		color: {
			validate(value) {
				return typeof value === 'string' && HEX_COLOR.test(value)
					? { valid: true }
					: { valid: false, message: 'Enter a color, e.g. #ff6600' };
			},
			serialize(value) {
				return String(value).toLowerCase();
			}
		}
	}
});
`,
		'ui/color-input.svelte': `<script lang="ts">
	import type { FieldInputProps } from '@pouchbasejs/plugin-sdk/ui';

	let { name, value, required, disabled, id, errorId }: FieldInputProps<string> = $props();
</script>

<input
	type="color"
	{id}
	{name}
	value={value ?? '#000000'}
	{required}
	{disabled}
	aria-describedby={errorId}
/>
`,
		'ui/color-cell.svelte': `<script lang="ts">
	import type { FieldCellProps } from '@pouchbasejs/plugin-sdk/ui';

	let { value }: FieldCellProps<string> = $props();
</script>

<span style:display="inline-flex" style:align-items="center" style:gap="0.375rem">
	<span
		style:width="0.75rem"
		style:height="0.75rem"
		style:border-radius="9999px"
		style:background={value}
	></span>
	{value}
</span>
`,
		'README.md': `# ${title(id)}

A [Pouchbase](https://pouchbase.io) plugin.

- \`pnpm dev\` builds the plugin on every change and serves it from a local registry; start
  Pouchbase with the \`PLUGIN_REGISTRY_URL\` it prints and install the plugin on the Plugins page.
- \`pnpm build\` writes the bundle to \`dist/\`.
- \`pnpm release\` publishes it to the registry (needs \`POUCHBASE_REGISTRY_TOKEN\`).
`
	};
}

export async function initProject(target: string) {
	const root = resolve(target);
	const id = basename(root);

	if (!PLUGIN_ID_PATTERN.test(id) || id.length < 3) {
		throw new ProjectError(
			`"${id}" can't be a plugin id; use a directory name of lowercase words separated by dashes, e.g. color-picker`
		);
	}

	const existing = await readdir(root).catch(() => []);

	if (existing.length) {
		throw new ProjectError(`${root} is not empty`);
	}

	for (const [path, contents] of Object.entries(templates(id, await sdkVersion()))) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), contents.endsWith('\n') ? contents : `${contents}\n`);
	}

	return { root, id };
}
