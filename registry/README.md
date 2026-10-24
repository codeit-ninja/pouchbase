# Development registry

A second Pouchbase instance, `registry-dev`, to develop and test the plugin registry of pouchbase.io without touching the live one. It is the **development** environment; the instance behind `api.pouchbase.io` is **production**. Schema changes go between them with the Environments page of Pouchbase (pull and publish), and data stays where it is.

```
pouchbase-plugin dev / publish ──┐
app (pnpm dev:app, :5173) ───────┼──► site (pnpm dev:site, :5174)  /v1/* registry API, /account, /plugins
                                 │            │
                                 │            ▼
                                 │     registry-dev (pnpm dev:registry, :5175)  ◄── pull / publish ──►  api.pouchbase.io
```

The registry API is served by the site (`site/src/routes/v1`), which keeps its data in the collections of a Pouchbase instance. Pointing the site's dev server at this instance gives a complete local registry at `http://localhost:5174`.

## Set up once

1. `cp registry/.env.example registry/.env` and fill in the Cloudflare credentials (the ones from the root `.env` work). The instance creates its own D1 databases and R2 bucket, named after `POUCHBASE_INSTANCE`.
2. `pnpm dev:registry` (or `pnpm --filter pouchbase-registry dev`). The first run builds the Node version of Pouchbase (`pnpm build:node`); open `http://localhost:5175` and install it.
3. Under **System → Environments**, set **This instance** to **Development**.
4. Link the live registry: on `https://api.pouchbase.io`, under **System → Environments → Deploy tokens**, create a token; here, under **Linked instance**, link `https://api.pouchbase.io` with it.
5. **Pull** from the linked instance. That creates the `plugins`, `plugin_versions` and `publish_tokens` collections with their fields, indexes and API rules, and takes over the auth and mail settings that travel with a snapshot.
6. Set up what doesn't travel: mail credentials (or mark test accounts verified in the dashboard, since the site only lets verified accounts in), and under **System → API keys** a key with the **service** scope.
7. Point the site's dev server at this instance in `site/.env.development.local` (`pnpm dev` reads it on top of `site/.env`; builds and deploys don't):

   ```sh
   POUCHBASE_URL=http://localhost:5175
   POUCHBASE_SERVICE_KEY=pbk_…   # the service key from step 6
   ```

## Use it

- `pnpm dev` starts the app (`:5173`), the site (`:5174`) and this instance (`:5175`); without `registry/.env` the registry is skipped.
- Let a Pouchbase instance install from the local registry with `PLUGIN_REGISTRY_URL=http://localhost:5174` in its `.env` (the root `.env` for `pnpm dev:app`).
- Publish to it: sign up on `http://localhost:5174/account/sign-up`, create a publish token under **Account**, then

  ```sh
  POUCHBASE_REGISTRY_URL=http://localhost:5174 POUCHBASE_REGISTRY_TOKEN=pbp_… pnpm --filter @pouchbase-plugins/auth-google release
  ```

  or for all first-party plugins: `POUCHBASE_REGISTRY_URL=http://localhost:5174 POUCHBASE_REGISTRY_TOKEN=pbp_… pnpm release:plugins`.

- Rebuild after pulling app changes: `pnpm --filter pouchbase-registry dev -- --build` (or `pnpm build:node`). The instance migrates its databases itself on the first request after a new build, like every Pouchbase update.

## Sync schema changes

1. Change the collections here (dashboard, or `pb.collections` with the service key) and the site code that uses them, and test them locally.
2. Under **System → Environments**, **Publish** to the linked instance. The plan lists every change first; changes that delete fields or data need a confirmation.
3. Publish before the site version that needs the change is deployed (merging the Version Packages pull request deploys the site), and update the collections table in `site/README.md`.

To bring the development instance up to date with changes made on the live one, **Pull** instead.
