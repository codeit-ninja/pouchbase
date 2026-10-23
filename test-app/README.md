# Pouchbase test app

A SvelteKit app with Pouchbase as its backend, for trying out Pouchbase and the [JS SDK](../packages/js-sdk) by hand. It uses the SDK from the workspace, so changes to the SDK show up without a build.

## Run

The test app has its own Pouchbase: a Docker container built from this checkout, on http://localhost:4300, so it doesn't share data with `pnpm dev`. From the repository root:

```sh
pnpm test-app:pouchbase   # build and start Pouchbase in Docker on http://localhost:4300
pnpm test-app             # this app on http://localhost:5175
```

The container runs as the instance `pouchbase-test` (`POUCHBASE_INSTANCE`), so it gets its own system database and function Workers on Cloudflare. It takes the Cloudflare credentials from the `.env` at the repository root, or from `test-app/.env`. It installs itself on the first request, with the admin `admin@pouchbase.test` and password `pouchbase-test` (set `POUCHBASE_ADMIN_EMAIL` and `POUCHBASE_ADMIN_PASSWORD` in `test-app/.env` for others); log in to the dashboard at http://localhost:4300 with those. Run `pnpm pouchbase:up` again in `test-app/` after changing the app, to rebuild; `pnpm pouchbase:logs` follows the logs and `pnpm pouchbase:down` stops it.

To test against another instance, such as `pnpm dev:app` on http://localhost:5173, set `VITE_POUCHBASE_URL` in `test-app/.env` (see `.env.example`) or use the URL field in the header, which is remembered in the browser.

## Pages

| Page      | What it tries                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Health    | `pb.health()`, `pb.auth.providers()`                                                                                                           |
| Auth      | Sign-up, sign-in, OAuth popups, `me()`, password resets, email verification                                                                    |
| Records   | `findMany`, `findFirst`, `count`, `findAll`, `find`, `insert`, `patch`, `remove` on any collection, with `where` objects or filter expressions |
| Realtime  | Subscriptions to a collection or a record, with the connection state and events                                                                |
| Functions | `pb.functions.invoke()` with any method, path, query and body                                                                                  |
| Files     | `pb.files.url()` with thumbnails and downloads, and the `files` collection                                                                     |

Every call shows its result or the `PouchbaseError` (kind, status, message, issues) and how long it took. The token is kept in `localStorage` by `LocalAuthStore`.
