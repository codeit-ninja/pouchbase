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

`init` asks for a template (in a terminal; otherwise, or with `--template`, it uses the one given or `field`):

| Template        |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| `field`         | A color field type with an input, a cell and validation on the server.                      |
| `page`          | A dashboard page that calls the plugin's `GET /hello` route.                                |
| `auth-provider` | A sign-in provider with `createOidcProvider`; `init auth-acme` creates the provider `acme`. |
| `empty`         | Only the manifest; add contributions with `pouchbase-plugin add`.                           |

Every template writes `$schema` and `categories` in the manifest and keeps `version` and `license` in `package.json`.

`pnpm dev` rebuilds the plugin on every change and serves it from a local registry. Start Pouchbase with `PLUGIN_REGISTRY_URL=http://localhost:4510` (`pnpm dev` in the Pouchbase repository) and install the plugin from the Plugins page. Every build is served as a new prerelease, `<version>-dev.<n>`, so Pouchbase sees it as an update; `--exact-version` serves the version from the manifest instead.

Add more to a plugin with `add`, which appends the contribution to `pouchbase-plugin.json` and creates its files (it never overwrites one):

```bash
npx pouchbase-plugin add field rating            # ui/rating-input.svelte, ui/rating-cell.svelte
npx pouchbase-plugin add page reports/monthly    # ui/reports-monthly-page.svelte
npx pouchbase-plugin add auth-provider gitlab    # server/index.ts when the plugin has no server code
```

When the plugin already has server code, `add` prints what to add to it, such as the `authProviders.gitlab` handler. An explicit `categories` list gets the category of the new contribution.

## A plugin

```
color-picker/
├── pouchbase-plugin.json   # the manifest
├── server/index.ts         # server code (optional)
└── ui/                     # Svelte components, the files they import and images
    ├── color-input.svelte
    ├── color-cell.svelte
    └── gitlab.svg
```

### Manifest

```json
{
	"$schema": "https://pouchbase.io/schemas/plugin-manifest.json",
	"apiVersion": 1,
	"id": "color-picker",
	"name": "Color picker",
	"version": "1.0.0",
	"description": "Adds a color field type.",
	"license": "MIT",
	"categories": ["fields", "pages", "auth"],
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
				"consoleUrl": "https://gitlab.com/-/user_settings/applications",
				"icon": "ui/gitlab.svg"
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
| `categories`          | Up to three of `PLUGIN_CATEGORIES`, where the registry lists the plugin. See [Categories](#categories).                                                              |
| `engines.pouchbase`   | Semver range of the Pouchbase versions the plugin works with.                                                                                                        |
| `permissions.network` | Hosts the server code may reach over HTTPS; `*.example.com` matches its subdomains, not `example.com` itself. Shown to the admin before installing.                  |
| `server`              | Entry of the server code. Required for auth providers.                                                                                                               |
| `contributes`         | What the plugin adds. Every Svelte component lives in `ui/`.                                                                                                         |

An auth provider's `id` is its public id (`gitlab`), used as is in the sign-in URLs and the API rather than namespaced by the plugin: Pouchbase refuses to install a plugin whose provider id another installed plugin already contributes, and `password`, `email` and `otp` are reserved (`RESERVED_PROVIDER_IDS`). Its optional `icon` is an SVG in `ui/` (e.g. the provider's logo), shown on the sign-in button and in the settings.

`parseManifest(json)` validates a manifest the same way Pouchbase does on install.

`name`, `version`, `description`, `license`, `author`, `homepage`, `repository` and `keywords` may be left out when the plugin's `package.json` has them; the CLI fills them in (`withPackageDefaults`), and a value in the manifest wins. So `version` can live in `package.json` alone. `author` may use npm's `Name <email> (url)` form, and `repository` is turned into a browsable URL (`git+https://github.com/me/plugin.git` → `https://github.com/me/plugin`).

`"$schema": "https://pouchbase.io/schemas/plugin-manifest.json"` (`MANIFEST_SCHEMA_URL`) gives editors completion and checks. `pouchbase-plugin schema` prints the same JSON Schema (`manifestJsonSchema()`).

### Categories

The registry and the Plugins page group plugins by category. The list is fixed (`PLUGIN_CATEGORIES`, with names in `PLUGIN_CATEGORY_LABELS`):

| Category          | Name              |
| ----------------- | ----------------- |
| `auth`            | Sign-in providers |
| `fields`          | Field types       |
| `pages`           | Pages             |
| `integrations`    | Integrations      |
| `developer-tools` | Developer tools   |

`pouchbase-plugin validate`, `build` and the registry reject other categories; Pouchbase itself only checks the format, so a plugin with a category added in a later SDK still installs. Without `categories`, a plugin is listed under the ones its contributions imply (`effectiveCategories`): `auth` for auth providers, `fields` for fields and `pages` for pages.

### Versioning

- `API_VERSION` is the version of everything in this package: the manifest, the bundle format, the server API and the component props, and of the modules the host provides to UI files (`HOST_MODULES`), including the component names and props of `@pouchbasejs/ui`.
- Within an API version, changes are only additive (new optional manifest fields, new contribution kinds, new context members). Pouchbase ignores what it doesn't know. A plugin that needs something added later sets `engines.pouchbase`.
- A change that would break existing plugins bumps the API version. Pouchbase supports the current API version and the one before it (`SUPPORTED_API_VERSIONS`), and refuses plugins it can't run (`checkCompatibility`).

### Server code

The server code runs in its own Worker on your Cloudflare account (built-in plugins, which ship with Pouchbase, run inside Pouchbase). It can't import Node.js modules or reach the network, except through `ctx.fetch` to the HTTPS hosts in `permissions.network`; the Worker has no bindings, and the global `fetch` is limited to the same hosts. Redirects are not followed: `ctx.fetch` returns the redirect response, and fetching its `Location` is checked again. For an auth provider, the host reads `authorizeUrl`, `tokenUrl`, `scopes` and `pkce` when the plugin is installed and does the OAuth redirect and token exchange itself; only `profile` runs during a sign-in.

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

#### Helpers

`@pouchbasejs/plugin-sdk/server` has a few helpers besides `definePlugin`; like the rest of the module, they only use `ctx.fetch`:

| Helper                                                                                     |                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineField(handler)`, `defineAuthProvider(handler)`                                      | Type a field type or auth provider written in its own file.                                                                                                                                                                                                       |
| `fetchJson<T>(ctx, url, accessToken, headers?)`                                            | GET JSON with `Authorization: Bearer <token>`, `Accept: application/json` and a `User-Agent`; `headers` adds to them (e.g. `Client-Id`). Throws on a non-2xx response.                                                                                            |
| `createOidcProvider({ authorizeUrl, tokenUrl, userinfoUrl, scopes?, pkce?, mapProfile? })` | An auth provider for an OpenID Connect provider: the profile comes from the userinfo endpoint (`sub`, `email`, `email_verified`, `name`, `picture`). Scopes default to `openid email profile`, PKCE to on; `mapProfile(claims, profile, ctx)` adjusts the result. |

```ts
import { createOidcProvider, definePlugin, fetchJson } from '@pouchbasejs/plugin-sdk/server';

export default definePlugin({
	authProviders: {
		// An OpenID Connect provider
		gitlab: createOidcProvider({
			authorizeUrl: 'https://gitlab.com/oauth/authorize',
			tokenUrl: 'https://gitlab.com/oauth/token',
			userinfoUrl: 'https://gitlab.com/oauth/userinfo'
		}),
		// A provider with its own profile API
		forgejo: {
			authorizeUrl: 'https://codeberg.org/login/oauth/authorize',
			tokenUrl: 'https://codeberg.org/login/oauth/access_token',
			scopes: ['read:user'],
			pkce: true,
			async profile(accessToken, credentials, ctx) {
				const user = await fetchJson<{
					id: number;
					login: string;
					email: string;
					avatar_url: string;
				}>(ctx, 'https://codeberg.org/api/v1/user', accessToken);

				return {
					id: String(user.id),
					email: user.email || null,
					emailVerified: false,
					name: user.login,
					avatarUrl: user.avatar_url
				};
			}
		}
	}
});
```

### UI components

Pouchbase compiles the `.svelte` files with its own Svelte compiler on install and renders them in the dashboard. They receive the props from `@pouchbasejs/plugin-sdk/ui` (`FieldInputProps`, `FieldCellProps`, `PageProps`) and may import the modules in `HOST_MODULES` and other files in `ui/`:

| Module                       |                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `svelte`, `svelte/*`         | Svelte itself, in the version of the dashboard.                                          |
| `@pouchbasejs/plugin-sdk/ui` | The prop types.                                                                          |
| `@pouchbasejs/ui`, `/*`      | The dashboard's own components, e.g. `import * as Button from '@pouchbasejs/ui/button'`. |

Pouchbase provides these modules at runtime, so a plugin never ships its own copy; install them as devDependencies for type checking (the templates do). Components from [`@pouchbasejs/ui`](https://www.npmjs.com/package/@pouchbasejs/ui) look and behave like the rest of the dashboard. TypeScript modules in `ui/` are compiled to JavaScript by the CLI.

```svelte
<script lang="ts">
	import type { PageProps } from '@pouchbasejs/plugin-sdk/ui';

	import * as Button from '@pouchbasejs/ui/button';

	let { api }: PageProps = $props();
</script>

<Button.Root onclick={() => api.fetch('/sync', { method: 'POST' })}>Sync now</Button.Root>
```

## Bundle

`pouchbase-plugin build` writes one JSON file, `dist/<id>-<version>.json`: the manifest, the server code bundled into `server.js`, and the `ui/` files (`.svelte`, `.js`, `.css`, `.json` and `.svg`). `server.js` may not import anything, `cloudflare:*` and `node:*` modules included: `parseBundle` (used by the CLI, the registry and Pouchbase) refuses server code with static or dynamic imports (`serverCodeIssues`). Bundles are at most 1 MiB (`MAX_BUNDLE_SIZE`). The registry lists a Subresource Integrity hash (`sha256-…`) with every version, and Pouchbase refuses a download that doesn't match.

## Registry API

The dashboard and the CLI talk to a plugin registry (`https://api.pouchbase.io` by default) through `createRegistryClient`. Any server that implements these endpoints can be a registry:

| Method | Path                                                  | Response                                                                                |
| ------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/v1/plugins?q=&category=&page=&perPage=&apiVersion=` | `PluginList`; `category` only lists plugins in that category                            |
| GET    | `/v1/plugins/:id`                                     | `PluginDetails`, 404                                                                    |
| GET    | `/v1/plugins/:id/versions/:version`                   | `PluginVersion`, 404; `:version` may be `latest`                                        |
| GET    | `PluginVersion.bundleUrl`                             | the bundle                                                                              |
| POST   | `/v1/plugins/:id/versions`                            | 201 `PluginVersion`, 401, 409, 422; the bundle as body, `Authorization: Bearer <token>` |

Errors have the body `{ "error": { "code": "...", "message": "...", "issues": [...] } }`.

## CLI

| Command                                                         |                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pouchbase-plugin init <dir> [--template <name>]`               | Create a plugin from `field`, `page`, `auth-provider` or `empty`; the directory name becomes its id. Asks for the template in a terminal.                                                                       |
| `pouchbase-plugin add <field\|page\|auth-provider> <id>`        | Add a contribution to the manifest and create its files.                                                                                                                                                        |
| `pouchbase-plugin validate`                                     | Check the manifest, the files it points to, the imports and the server code: every auth provider needs a handler, every handler a contribution, and route keys look like `GET /path`.                           |
| `pouchbase-plugin build`                                        | Write the bundle to `dist/`.                                                                                                                                                                                    |
| `pouchbase-plugin dev [--port 4510] [--exact-version]`          | Rebuild on every change and serve the plugin from a local registry, as `<version>-dev.<n>` unless `--exact-version`.                                                                                            |
| `pouchbase-plugin schema`                                       | Print the JSON Schema of `pouchbase-plugin.json`.                                                                                                                                                               |
| `pouchbase-plugin publish [--registry <url>] [--token <token>]` | Build and publish; defaults to `$POUCHBASE_REGISTRY_URL` and `$POUCHBASE_REGISTRY_TOKEN`. Create a publish token under **Account** on [pouchbase.io](https://pouchbase.io/account), or upload the bundle there. |

## License

MIT. Plugins may use any license: see the [Pouchbase Plugin Exception](https://github.com/pouchbase/pouchbase/blob/main/PLUGIN-EXCEPTION.md).
