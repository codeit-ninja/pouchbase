# @pouchbasejs/plugin-sdk

## 0.2.0

### Minor Changes

- [`3096c45`](https://github.com/pouchbase/pouchbase/commit/3096c457493558e9cd2df9fdad8f4d92b4e1e35e) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Plugins can declare `categories`, and the registry API filters by category. The manifest can leave out `name`, `version`, `license` and other fields that `package.json` has, takes a `$schema` for editor completion (`pouchbase-plugin schema` prints it), and the server module adds `createOidcProvider`, `fetchJson`, `defineField` and `defineAuthProvider`. `pouchbase-plugin init` offers `field`, `page`, `auth-provider` and `empty` templates, `pouchbase-plugin add` adds a field, page or auth provider with its files, `dev` serves every build as `<version>-dev.<n>` (unless `--exact-version`), and `validate` checks the server code's handlers against the manifest. UI files may import the dashboard's components from `@pouchbasejs/ui` (`HOST_MODULES`), auth providers can have an SVG `icon` from `ui/` (provider ids follow the exported `PROVIDER_ID_PATTERN`), and bundles may hold `.svg` files. The docs describe how hosts run server code (in its own Worker on your Cloudflare account) and that `*.example.com` in `permissions.network` matches subdomains, not `example.com` itself. Provider ids `password`, `email` and `otp` are reserved (`RESERVED_PROVIDER_IDS`), and bundles whose server code still imports other modules are refused (`serverCodeIssues`).

## 0.1.1

### Patch Changes

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - The public plugin registry is now at `https://api.pouchbase.io`: the Plugins page and `pouchbase-plugin publish` use it unless `PLUGIN_REGISTRY_URL` or `--registry` says otherwise.

## 0.1.0

### Minor Changes

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add **Plugins** under System: search the plugin marketplace and install, update or remove plugins. Installs are checked against the plugin's integrity hash, its manifest and the plugin API version. Plugins are built with the new `@pouchbasejs/plugin-sdk` package (manifest schema, types and the `pouchbase-plugin` CLI with `init`, `dev`, `build` and `publish`), and may use any license under the new Pouchbase Plugin Exception. Running what plugins add (field types, pages and sign-in providers) follows in a later release.
