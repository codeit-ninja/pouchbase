import type { FieldContribution, PageContribution } from '../manifest.js';

import { API_VERSION } from '../api-version.js';
import { MANIFEST_FILE, MANIFEST_SCHEMA_URL } from '../manifest.js';

/** The files `init` and `add` write: path → contents. */

export type Files = Record<string, string>;

/** Starting points for `pouchbase-plugin init --template <name>`. */
export const TEMPLATES = ['field', 'page', 'auth-provider', 'empty'] as const;

export type PluginTemplate = (typeof TEMPLATES)[number];

export const TEMPLATE_DESCRIPTIONS: Record<PluginTemplate, string> = {
	field: 'A color field type with validation on the server',
	page: 'A dashboard page that calls a route of the plugin',
	'auth-provider': 'A sign-in provider for an OpenID Connect provider',
	empty: 'Only the manifest'
};

export function isTemplate(value: string): value is PluginTemplate {
	return (TEMPLATES as readonly string[]).includes(value);
}

/** `color-picker` → `Color picker`, `rich_color` → `Rich color`, `reports/monthly` → `Monthly`. */
export function title(id: string) {
	const words = (id.split('/').at(-1) ?? id).split(/[-_]/).join(' ');

	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `rich_color` → `rich-color`, `reports/monthly` → `reports-monthly`: a file name. */
function fileName(id: string) {
	return id.replace(/[_/]/g, '-');
}

/** JSON as the templates write it: tab-indented, with a final newline. */
export function json(value: unknown) {
	return `${JSON.stringify(value, null, '\t')}\n`;
}

/** The provider id for a plugin id: `auth-acme` → `acme`. */
export function providerIdFor(pluginId: string) {
	return pluginId.replace(/^auth-(?=.)/, '');
}

// Fields

/** A field contribution with a text input and a cell, and its components. */
export function fieldFiles(type: string): { contribution: FieldContribution; files: Files } {
	const input = `ui/${fileName(type)}-input.svelte`;
	const cell = `ui/${fileName(type)}-cell.svelte`;

	return {
		contribution: {
			type,
			label: title(type),
			description: `A ${title(type).toLowerCase()} value.`,
			column: 'TEXT',
			input,
			cell
		},
		files: {
			[input]: `<script lang="ts">
	import type { FieldInputProps } from '@pouchbasejs/plugin-sdk/ui';

	let { name, value, required, disabled, id, errorId }: FieldInputProps<string> = $props();
</script>

<input
	type="text"
	{id}
	{name}
	value={value ?? ''}
	{required}
	{disabled}
	aria-describedby={errorId}
/>
`,
			[cell]: `<script lang="ts">
	import type { FieldCellProps } from '@pouchbasejs/plugin-sdk/ui';

	let { value }: FieldCellProps<string> = $props();
</script>

{value ?? ''}
`
		}
	};
}

/** The `field` template: a color field type. */
function colorFieldFiles(): { contribution: FieldContribution; files: Files } {
	return {
		contribution: {
			type: 'color',
			label: 'Color',
			description: 'A color as a hex code, e.g. #ff6600.',
			column: 'TEXT',
			input: 'ui/color-input.svelte',
			cell: 'ui/color-cell.svelte'
		},
		files: {
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
`
		}
	};
}

// Pages

/** A page contribution and its component. */
export function pageFiles(path: string): {
	contribution: Pick<PageContribution, 'path' | 'title' | 'component'>;
	files: Files;
} {
	const component = `ui/${fileName(path)}-page.svelte`;

	return {
		contribution: { path, title: title(path), component },
		files: {
			[component]: `<script lang="ts">
	import type { PageProps } from '@pouchbasejs/plugin-sdk/ui';

	let { params }: PageProps = $props();
</script>

<h1>${title(path)}</h1>

<p>Path below the page: /{params.join('/')}</p>
`
		}
	};
}

/** The `page` template: a page that shows what its `GET /hello` route returns. */
function helloPageFiles(pluginId: string): {
	contribution: Pick<PageContribution, 'path' | 'title' | 'component'>;
	files: Files;
} {
	return {
		contribution: { path: 'hello', title: 'Hello', component: 'ui/hello-page.svelte' },
		files: {
			'ui/hello-page.svelte': `<script lang="ts">
	import type { PageProps } from '@pouchbasejs/plugin-sdk/ui';

	import * as Button from '@pouchbasejs/ui/button';

	let { api }: PageProps = $props();

	async function hello() {
		const response = await api.fetch('/hello');

		if (!response.ok) {
			throw new Error(\`The route answered \${response.status}\`);
		}

		const body = (await response.json()) as { message: string };

		return body.message;
	}

	let message = $state(hello());
</script>

<h1>Hello</h1>

{#await message}
	<p>Loading…</p>
{:then text}
	<p>{text}</p>
{:catch error}
	<p>{error.message}</p>
{/await}

<!-- Components from @pouchbasejs/ui look like the rest of the dashboard. -->
<Button.Root variant="secondary" onclick={() => (message = hello())}>Ask again</Button.Root>
`,
			'server/index.ts': `import { definePlugin } from '@pouchbasejs/plugin-sdk/server';

export default definePlugin({
	routes: {
		// Served at /api/plugins/${pluginId}/hello; the page calls it with api.fetch('/hello').
		'GET /hello': (_request, ctx) =>
			Response.json({ message: \`Hello from \${ctx.plugin.id} \${ctx.plugin.version}\` })
	}
});
`
		}
	};
}

// Auth providers

/** Example endpoints of the provider that the templates use; the author replaces them. */
export const EXAMPLE_PROVIDER_HOST = 'id.example.com';

/** Path of a provider's icon, e.g. `ui/acme.svg`. */
export function providerIconPath(id: string) {
	return `ui/${id}.svg`;
}

/** A placeholder icon for the sign-in button; the author replaces it with the provider's logo. */
export const PROVIDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
`;

/** The server entry with one OpenID Connect provider. */
export function authProviderServer(id: string) {
	return `import { createOidcProvider, definePlugin } from '@pouchbasejs/plugin-sdk/server';

/**
 * Replace the URLs with those of your provider, and its host in permissions.network in
 * ${MANIFEST_FILE}. For a provider without OpenID Connect, write the handler yourself:
 *
 *   import { defineAuthProvider, fetchJson } from '@pouchbasejs/plugin-sdk/server';
 *
 *   const provider = defineAuthProvider({
 *   	authorizeUrl: 'https://${EXAMPLE_PROVIDER_HOST}/oauth/authorize',
 *   	tokenUrl: 'https://${EXAMPLE_PROVIDER_HOST}/oauth/token',
 *   	scopes: ['read:user'],
 *   	pkce: true,
 *   	async profile(accessToken, credentials, ctx) {
 *   		const user = await fetchJson<{ id: number; email: string }>(
 *   			ctx,
 *   			'https://${EXAMPLE_PROVIDER_HOST}/api/user',
 *   			accessToken
 *   		);
 *
 *   		return {
 *   			id: String(user.id),
 *   			email: user.email,
 *   			emailVerified: false,
 *   			name: null,
 *   			avatarUrl: null
 *   		};
 *   	}
 *   });
 */
const ${camelCase(id)} = createOidcProvider({
	authorizeUrl: 'https://${EXAMPLE_PROVIDER_HOST}/oauth/authorize',
	tokenUrl: 'https://${EXAMPLE_PROVIDER_HOST}/oauth/token',
	userinfoUrl: 'https://${EXAMPLE_PROVIDER_HOST}/oauth/userinfo'
});

export default definePlugin({
	authProviders: {
		${objectKey(id)}: ${camelCase(id)}
	}
});
`;
}

/** `my-sso` → `mySso`. */
function camelCase(id: string) {
	return id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/** `acme` → `acme`, `my-sso` → `'my-sso'`. */
export function objectKey(id: string) {
	return /^[a-z_$][\w$]*$/i.test(id) ? id : `'${id}'`;
}

// Projects

/** The `@pouchbasejs/ui` versions new plugins are written against. */
export const UI_PACKAGE_RANGE = '^0.1.0';

function readme(name: string) {
	return `# ${name}

A [Pouchbase](https://pouchbase.io) plugin.

- \`pnpm dev\` builds the plugin on every change and serves it from a local registry; start
  Pouchbase with the \`PLUGIN_REGISTRY_URL\` it prints and install the plugin on the Plugins page.
- \`pnpm validate\` checks the manifest, the files it points to and the server code.
- \`pnpm build\` writes the bundle to \`dist/\`.
- \`pnpm release\` publishes it to the registry (needs \`POUCHBASE_REGISTRY_TOKEN\`).
- \`npx pouchbase-plugin add field|page|auth-provider <id>\` adds a contribution.

The version lives in \`package.json\`; the manifest takes it from there.
`;
}

/**
 * Every file of a new plugin. The manifest has a human `name` and no `version`: `version` (and
 * `license`) come from `package.json`, so a release only bumps one file.
 */
export function projectFiles(id: string, template: PluginTemplate, sdkVersion: string): Files {
	const name = title(id);
	const manifest: Record<string, unknown> = {
		$schema: MANIFEST_SCHEMA_URL,
		apiVersion: API_VERSION,
		id,
		name,
		description: 'A Pouchbase plugin.'
	};
	let files: Files = {};

	switch (template) {
		case 'field': {
			const field = colorFieldFiles();

			manifest.description = 'Adds a color field type.';
			manifest.categories = ['fields'];
			manifest.server = 'server/index.ts';
			manifest.contributes = { fields: [field.contribution] };
			files = field.files;
			break;
		}

		case 'page': {
			const page = helloPageFiles(id);

			manifest.description = 'Adds a page to the dashboard.';
			manifest.categories = ['pages'];
			manifest.server = 'server/index.ts';
			manifest.contributes = { pages: [page.contribution] };
			files = page.files;
			break;
		}

		case 'auth-provider': {
			const provider = providerIdFor(id);

			manifest.name = `${title(provider)} sign-in`;
			manifest.description = `Sign in with ${title(provider)}.`;
			manifest.categories = ['auth'];
			manifest.permissions = { network: [EXAMPLE_PROVIDER_HOST] };
			manifest.server = 'server/index.ts';
			manifest.contributes = {
				authProviders: [
					{
						id: provider,
						label: title(provider),
						consoleUrl: `https://${EXAMPLE_PROVIDER_HOST}/apps`,
						icon: providerIconPath(provider)
					}
				]
			};
			files = {
				'server/index.ts': authProviderServer(provider),
				[providerIconPath(provider)]: PROVIDER_ICON
			};
			break;
		}

		case 'empty':
			manifest.contributes = {};
			break;
	}

	return {
		[MANIFEST_FILE]: json(manifest),
		'package.json': json({
			name: id,
			version: '0.1.0',
			private: true,
			license: 'MIT',
			type: 'module',
			scripts: {
				dev: 'pouchbase-plugin dev',
				validate: 'pouchbase-plugin validate',
				build: 'pouchbase-plugin build',
				release: 'pouchbase-plugin publish'
			},
			devDependencies: {
				'@pouchbasejs/plugin-sdk': `^${sdkVersion}`,
				// Types only: the host provides the components at runtime.
				'@pouchbasejs/ui': UI_PACKAGE_RANGE,
				svelte: '^5.0.0',
				typescript: '^6.0.0'
			}
		}),
		'tsconfig.json': json({
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
		}),
		'.gitignore': 'node_modules\ndist\n',
		'README.md': readme(name),
		...files
	};
}
