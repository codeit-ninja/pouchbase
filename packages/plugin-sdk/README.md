# @pouchbasejs/plugin-sdk

Types, the manifest schema and the `pouchbase-plugin` CLI for building [Pouchbase](https://pouchbase.io) plugins. Plugins add field types, dashboard pages and sign-in providers to a Pouchbase instance, and are installed from the plugin registry on the Plugins page of the dashboard, without rebuilding Pouchbase.

> [!NOTE]
> This is plugin API version 1. Pouchbase can already search, install and remove plugins; running their contributions (fields, pages, auth providers) follows in upcoming releases.

## Quick start

```bash
npx @pouchbasejs/plugin-sdk init color-picker
cd color-picker
pnpm install
pnpm dev
```

`pnpm dev` rebuilds the plugin on every change and serves it from a local registry. Start Pouchbase with `PLUGIN_REGISTRY_URL=http://localhost:4510` (`pnpm dev` in the Pouchbase repository) and install the plugin from the Plugins page.

## A plugin

```
color-picker/
├── pouchbase-plugin.json   # the manifest
├── server/index.ts         # server code (optional)
└── ui/                     # Svelte components and the files they import
    ├── color-input.svelte
    └── color-cell.svelte
```

### Manifest

```json
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
		"pages": [{ "path": "palette", "title": "Palette", "component": "ui/palette-page.svelte" }],
		"authProviders": [
			{
				"id": "gitlab",
				"label": "GitLab",
				"consoleUrl": "https://gitlab.com/-/user_settings/applications"
			}
		]
	}
}
```

| Field                 |                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiVersion`          | The plugin API version the plugin is written against.                                                                                                                |
| `id`                  | Unique in the registry: lowercase words separated by dashes. Everything the plugin adds is namespaced by it (`color-picker:color`, `/plugins/color-picker/palette`). |
| `version`             | Exact semver version of this release.                                                                                                                                |
| `engines.pouchbase`   | Semver range of the Pouchbase versions the plugin works with.                                                                                                        |
| `permissions.network` | Hosts the server code may reach; `*.example.com` includes subdomains. Shown to the admin before installing.                                                          |
| `server`              | Entry of the server code. Required for auth providers.                                                                                                               |
| `contributes`         | What the plugin adds. Every Svelte component lives in `ui/`.                                                                                                         |

`parseManifest(json)` validates a manifest the same way Pouchbase does on install.

### Versioning

- `API_VERSION` is the version of everything in this package: the manifest, the bundle format, the server API and the component props.
- Within an API version, changes are only additive (new optional manifest fields, new contribution kinds, new context members). Pouchbase ignores what it doesn't know. A plugin that needs something added later sets `engines.pouchbase`.
- A change that would break existing plugins bumps the API version. Pouchbase supports the current API version and the one before it (`SUPPORTED_API_VERSIONS`), and refuses plugins it can't run (`checkCompatibility`).

### Server code

The server code runs in a sandbox (a Dynamic Worker on Cloudflare). It can't import Node.js modules or reach the network, except through `ctx.fetch` to the hosts in `permissions.network`.

```ts
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
});
```

### UI components

Pouchbase compiles the `.svelte` files with its own Svelte compiler on install and renders them in the dashboard. They receive the props from `@pouchbasejs/plugin-sdk/ui` (`FieldInputProps`, `FieldCellProps`, `PageProps`) and may import `svelte`, `svelte/*`, `@pouchbasejs/plugin-sdk/ui` and other files in `ui/`. TypeScript modules in `ui/` are compiled to JavaScript by the CLI.

## Bundle

`pouchbase-plugin build` writes one JSON file, `dist/<id>-<version>.json`: the manifest, the server code bundled into `server.js`, and the `ui/` files. Bundles are at most 1 MiB (`MAX_BUNDLE_SIZE`). The registry lists a Subresource Integrity hash (`sha256-…`) with every version, and Pouchbase refuses a download that doesn't match.

## Registry API

The dashboard and the CLI talk to a plugin registry (`https://plugins.pouchbase.io` by default) through `createRegistryClient`. Any server that implements these endpoints can be a registry:

| Method | Path                                        | Response                                                                                |
| ------ | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/v1/plugins?q=&page=&perPage=&apiVersion=` | `PluginList`                                                                            |
| GET    | `/v1/plugins/:id`                           | `PluginDetails`, 404                                                                    |
| GET    | `/v1/plugins/:id/versions/:version`         | `PluginVersion`, 404; `:version` may be `latest`                                        |
| GET    | `PluginVersion.bundleUrl`                   | the bundle                                                                              |
| POST   | `/v1/plugins/:id/versions`                  | 201 `PluginVersion`, 401, 409, 422; the bundle as body, `Authorization: Bearer <token>` |

Errors have the body `{ "error": { "code": "...", "message": "...", "issues": [...] } }`.

## CLI

| Command                                                         |                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pouchbase-plugin init <dir>`                                   | Create a plugin; the directory name becomes its id.                                                                                                                                                             |
| `pouchbase-plugin validate`                                     | Check the manifest, the files it points to and the imports.                                                                                                                                                     |
| `pouchbase-plugin build`                                        | Write the bundle to `dist/`.                                                                                                                                                                                    |
| `pouchbase-plugin dev [--port 4510]`                            | Rebuild on every change and serve the plugin from a local registry.                                                                                                                                             |
| `pouchbase-plugin publish [--registry <url>] [--token <token>]` | Build and publish; defaults to `$POUCHBASE_REGISTRY_URL` and `$POUCHBASE_REGISTRY_TOKEN`. Create a publish token under **Account** on [pouchbase.io](https://pouchbase.io/account), or upload the bundle there. |

## License

MIT. Plugins may use any license: see the [Pouchbase Plugin Exception](https://github.com/pouchbase/pouchbase/blob/main/PLUGIN-EXCEPTION.md).
