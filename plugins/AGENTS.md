## Project Configuration

- **Project**: the first-party Pouchbase plugins, one private workspace package per plugin (`@pouchbase-plugins/<id>`, MIT)
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Tooling**: `@pouchbasejs/plugin-sdk` (`pouchbase-plugin` CLI, from the workspace), vitest, prettier and eslint from the repository root, Changesets

## Language

Everything in this project is **English**: code, identifiers, comments, docs and commit messages.

## Plugins

| Folder           | Plugin id        | Contributes                      |
| ---------------- | ---------------- | -------------------------------- |
| `auth-discord`   | `auth-discord`   | the sign-in provider `discord`   |
| `auth-github`    | `auth-github`    | the sign-in provider `github`    |
| `auth-google`    | `auth-google`    | the sign-in provider `google`    |
| `auth-microsoft` | `auth-microsoft` | the sign-in provider `microsoft` |
| `auth-twitch`    | `auth-twitch`    | the sign-in provider `twitch`    |

## Layout

```
plugins/
├── testing.ts               # fakeContext(): a PluginContext with canned fetch responses, for tests
└── auth-<provider>/
    ├── package.json         # @pouchbase-plugins/auth-<provider>: version, description, license, author, …
    ├── pouchbase-plugin.json  # the manifest: a human `name`, no `version` (it comes from package.json)
    ├── server/index.ts      # definePlugin({ authProviders: { <provider>: … } })
    ├── ui/<provider>.svg    # the provider's logo, from @iconify-json/logos
    ├── test/server.test.ts  # the profile mapping against fake API responses
    ├── tsconfig.json, README.md, LICENSE
```

## Rules

- A plugin is written like any third-party plugin, against the public contract in `packages/plugin-sdk` only: no imports from the app (`src/`, `#lib`) and nothing AGPL. Server code imports only `@pouchbasejs/plugin-sdk/server`.
- Plugin ids are `auth-<provider>`, package names `@pouchbase-plugins/<id>`; every package is `private` (they are published to the plugin registry, not npm). The manifest sets `name` itself, because `withPackageDefaults` would otherwise use the scoped package name.
- `version` lives only in `package.json` and is bumped by Changesets (`'@pouchbase-plugins/auth-github': patch`); a plugin change gets a changeset like any other package.
- `permissions.network` lists exactly the hosts that `profile()` calls, nothing more. The host does the authorize redirect and the token exchange itself from `authorizeUrl`, `tokenUrl`, `scopes` and `pkce`.
- Provider ids are global (`google`, not `auth-google.google`): they appear in sign-in URLs, the API and `_external_auths.provider`, so never rename one.
- Only set `emailVerified` when the provider guarantees the email belongs to the user; it links a sign-in to an existing user with that email.
- Every plugin has tests for its `profile()` mapping, using `fakeContext` from `testing.ts`, which also fails a request to a host outside `permissions.network`.

## Scripts

From the repository root:

- `pnpm plugins:test`: the tests of every plugin (one at a time; parallel vitest runs share a cache).
- `pnpm plugins:validate` / `pnpm plugins:build`: build the SDK (the `pouchbase-plugin` bin points at its `dist/`), then validate or build every plugin into `plugins/<id>/dist/`.
- `pnpm --filter @pouchbase-plugins/auth-github check|test|validate|build` for one plugin.
- `pnpm release:plugins`: build the SDK, then publish every plugin whose `id@version` the registry lacks (`scripts/publish-plugins.mjs`; `node scripts/publish-plugins.mjs --dry-run` only lists them). Normally only the Release workflow runs it.

## Releasing

Plugins are published to the plugin registry (`POUCHBASE_REGISTRY_URL`, default `https://api.pouchbase.io`), never to npm, and only by the Release workflow (`.github/workflows/release.yml`):

1. A plugin change gets a changeset, e.g. `.changeset/google-scopes.md` with `'@pouchbase-plugins/auth-google': patch`.
2. On `main`, the workflow keeps the **Version Packages** pull request up to date; it bumps the plugin's `package.json` version and writes its `CHANGELOG.md` (private packages are versioned, but get no git tag).
3. Merging that pull request runs the `publish-plugins` job: `scripts/publish-plugins.mjs` asks the registry for `GET /v1/plugins/<id>/versions/<version>` of every plugin (id from `pouchbase-plugin.json`, version from `package.json`) and runs `pouchbase-plugin publish` in each plugin the registry answers `404` for. A version that exists is skipped, so re-running the job is safe.

The job needs the `POUCHBASE_REGISTRY_TOKEN` secret, a publish token of the pouchbase.io account that owns the plugin ids (the first publish of an id makes that account its owner); without it, the job warns and publishes nothing.
