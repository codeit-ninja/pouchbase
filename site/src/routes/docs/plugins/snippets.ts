import { snippet } from '#lib/highlight.js';

export const init = snippet(
	'bash',
	`
npx @pouchbasejs/plugin-sdk init color-picker
cd color-picker
pnpm install
pnpm dev`
);

export const layout = snippet(
	'bash',
	`
color-picker/
├── pouchbase-plugin.json   # the manifest
├── server/index.ts         # server code (optional)
└── ui/                     # Svelte components and the files they import
    ├── color-input.svelte
    └── color-cell.svelte`
);

export const manifest = snippet(
	'json',
	`
{
	"apiVersion": 1,
	"id": "color-picker",
	"name": "Color picker",
	"version": "1.0.0",
	"description": "Adds a color field type.",
	"license": "MIT",
	"engines": { "pouchbase": ">=0.4.0" },
	"permissions": { "network": ["api.example.com"] },
	"server": "server/index.ts",
	"contributes": {
		"fields": [
			{
				"type": "color",
				"label": "Color",
				"description": "A hex color.",
				"column": "TEXT",
				"input": "ui/color-input.svelte",
				"cell": "ui/color-cell.svelte"
			}
		],
		"pages": [{ "path": "palette", "title": "Palette", "component": "ui/palette-page.svelte" }]
	}
}`
);

export const server = snippet(
	'typescript',
	`
import { definePlugin } from '@pouchbasejs/plugin-sdk/server';

export default definePlugin({
	fields: {
		color: {
			validate: (value) =>
				typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
					? { valid: true }
					: { valid: false, message: 'Enter a color, e.g. #ff6600' }
		}
	},
	routes: {
		'GET /stats': async (request, ctx) => Response.json({ ok: true })
	}
});`
);

export const component = snippet(
	'html',
	`
<script lang="ts">
	import type { FieldInputProps } from '@pouchbasejs/plugin-sdk/ui';

	let { id, name, value, required, disabled, errorId }: FieldInputProps<string> = $props();
</script>

<input
	type="color"
	{id}
	{name}
	value={value ?? '#000000'}
	{required}
	{disabled}
	aria-describedby={errorId}
/>`
);

export const devRegistry = snippet(
	'bash',
	`
# Server variable of the Pouchbase installation you test with
PLUGIN_REGISTRY_URL=http://localhost:4510`
);

export const build = snippet(
	'bash',
	`
npx pouchbase-plugin validate
npx pouchbase-plugin build   # writes dist/color-picker-1.0.0.json`
);

export const publish = snippet(
	'bash',
	`
export POUCHBASE_REGISTRY_TOKEN=pbp_...
npx pouchbase-plugin publish`
);

export const ci = snippet(
	'bash',
	`
# For example in a GitHub Actions step, with the token as a repository secret
POUCHBASE_REGISTRY_TOKEN=\${{ secrets.POUCHBASE_REGISTRY_TOKEN }} npx pouchbase-plugin publish`
);
