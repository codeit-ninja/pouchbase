# @pouchbasejs/plugin-sdk

## 0.1.1

### Patch Changes

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - The public plugin registry is now at `https://api.pouchbase.io`: the Plugins page and `pouchbase-plugin publish` use it unless `PLUGIN_REGISTRY_URL` or `--registry` says otherwise.

## 0.1.0

### Minor Changes

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add **Plugins** under System: search the plugin marketplace and install, update or remove plugins. Installs are checked against the plugin's integrity hash, its manifest and the plugin API version. Plugins are built with the new `@pouchbasejs/plugin-sdk` package (manifest schema, types and the `pouchbase-plugin` CLI with `init`, `dev`, `build` and `publish`), and may use any license under the new Pouchbase Plugin Exception. Running what plugins add (field types, pages and sign-in providers) follows in a later release.
