# pouchbase

## 0.8.0

### Minor Changes

- [`2fd04f3`](https://github.com/pouchbase/pouchbase/commit/2fd04f3ca1e1548d79e3f4a597ee4c114b2f4af1) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Improve the email editor: pick images from files or upload them to files, resize columns freely by dragging the border between them or with a column's width setting, set the space above and below every block, and drag blocks by their handle to move them, also into columns and sections.

- [`3096c45`](https://github.com/pouchbase/pouchbase/commit/3096c457493558e9cd2df9fdad8f4d92b4e1e35e) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Installing a plugin with server code deploys it to its own Worker on your Cloudflare account, with network access limited to its `permissions.network`, and registers the sign-in providers it adds. Sign-in providers are plugins: Google, GitHub, Microsoft, Discord and Twitch are built in and keep their settings, and more can be installed from the Plugins page. The Authentication page and `GET /api/auth/providers` show each provider's name and logo (`label`, `iconUrl`). Plugins whose server code imports other modules, such as `cloudflare:sockets`, are refused on install.

- [`3096c45`](https://github.com/pouchbase/pouchbase/commit/3096c457493558e9cd2df9fdad8f4d92b4e1e35e) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Filter plugins by category on the Plugins page, and see each plugin's categories.

- [`beca993`](https://github.com/pouchbase/pouchbase/commit/beca9932da720984cd97cbe52ade9b0ee323c65c) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Relation fields can have a default value: a record that new records link to when they don't set the field

- [`beca993`](https://github.com/pouchbase/pouchbase/commit/beca9932da720984cd97cbe52ade9b0ee323c65c) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Relation fields choose what happens when a linked record is deleted: unlink it (the default), cascade the delete, or restrict it

### Patch Changes

- [`ed8671d`](https://github.com/pouchbase/pouchbase/commit/ed8671deb5fe61166e5d4bd292f0364aa751a4ab) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Update now on a Worker installs the latest release, also when the last update check named an older one

## 0.7.0

### Minor Changes

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - App users sign in with their email instead of a username: the `username` field is removed from `users`, sign-up takes `{ name, email, password }`, and the email & password provider can require a verified email before users can sign in.

### Patch Changes

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - The environment of the instance (development or production) is set on the Environments page; the Settings page is gone.

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - The mail settings (provider, sender and SMTP server) and the test email moved from Settings to the Mail page.

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - The public plugin registry is now at `https://api.pouchbase.io`: the Plugins page and `pouchbase-plugin publish` use it unless `PLUGIN_REGISTRY_URL` or `--registry` says otherwise.

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Functions, Mail and Plugins now sit under Dashboard in the sidebar instead of in the System group.

## 0.6.0

### Minor Changes

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Admins sign in with their email address and password; usernames and the app name are gone, so installing is one step. With `POUCHBASE_ADMIN_EMAIL` and `POUCHBASE_ADMIN_PASSWORD` set, Pouchbase installs itself on the first request, without the install page.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a collections API (`/api/collections`, for API keys with the service scope) to create, change and delete collections with their fields, indexes and API rules, and export and import collections as a JSON file, also from the new menu next to Collections in the admin.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add email templates: design emails with variables (`{{name}}`, fallbacks, `#if` and `#each`) on the new Mail page, in a visual editor with styled buttons, images, sections, columns, spacers and dividers or as HTML, preview them with sample data, and send them from functions or your back-end through `POST /api/mail/send` with an API key. API keys are managed on the new API keys page (keys with the service scope also use the records API without API rules), every function gets its own as `env.POUCHBASE_API_KEY`, and the verification and password-reset emails can now be customized.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add environments: mark an instance as development or production, link a development instance to production with a deploy token, and publish collections, functions, plugins and settings to it (or pull them from it) from the new Environments page. Every publish shows its plan first, asks before it removes data, and makes a backup first when a backup destination exists.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `?expand=` to the records API: `?expand=author,comments.author` returns relation and file fields as the records they point to instead of ids, up to three levels deep, filtered by the view rule of each related collection. Realtime subscriptions take `expand` too. The generated `Schema` now lists the collection each relation points to (`$relations`).

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `install.sh`, which installs Pouchbase on a Linux server in one command: it installs Docker, asks for and checks the Cloudflare credentials, and starts Pouchbase with Docker Compose, behind Caddy with HTTPS when you give it a domain name.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add realtime: apps follow the creates, updates and deletes of a collection's records, or of one record, over a WebSocket at `/api/realtime`, filtered by the collection's view rule and an optional filter. On Workers each collection's connections live in a Durable Object (`RealtimeHub`); on Node the server holds them. The dashboard's records grid updates live too.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Show the version of Pouchbase at the bottom of the sidebar, with an update button when GitHub has a newer release. On Cloudflare Workers the update deploys the new version to the Worker itself, keeping its databases and secrets; the single binary replaces itself and restarts; Docker and Node installations get the commands to run.

### Patch Changes

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - API errors from before a route runs, such as "not installed yet", now carry the CORS headers, so apps on other origins see the message instead of a network error.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Make a first start on Workers recover when it is cut off halfway: each database migration runs as one transaction, a field whose column was left behind takes it over instead of failing with `CREATE_FIELD_FAILED`, and the log explains when the Worker is deployed under another name than its `POUCHBASE_INSTANCE` (which keeps it from adding its D1 bindings).

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Fix the Worker ignoring its D1 bindings and cutting off work that runs after a response (adding the bindings, verification emails): SvelteKit 3 no longer passes the Cloudflare platform to requests, so the Worker now reads its bindings from `cloudflare:workers`. Queries on Workers go through the bindings again instead of the slower D1 HTTP API.

## 0.5.0

### Minor Changes

- [`d4992e4`](https://github.com/pouchbase/pouchbase/commit/d4992e49d2a4f5789c07ceceda6cde7413fd9f5d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pouchbase update` to the binary, which replaces it with the latest release from GitHub (`--check` only reports whether one is available).

## 0.4.0

### Minor Changes

- [`58029b0`](https://github.com/pouchbase/pouchbase/commit/58029b007f98c5573495a07be2325faf34efecdb) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `POUCHBASE_INSTANCE` (and `--instance` on the binary) to run several separate instances on one Cloudflare account: it names the system database, the Worker and the function Workers.

## 0.3.0

### Minor Changes

- [`58ab82d`](https://github.com/pouchbase/pouchbase/commit/58ab82d2ec81c175c5b60d7f4754f32b8c0cde80) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - **Breaking:** the records API returns real values: booleans as `true`/`false`, JSON fields parsed, and multiple relations, files and lists as arrays (`[]` when empty), and `/api/auth/me` returns the user in the same shape. `?fields=id,title` returns only some fields. The generated types follow, with a `<Name>Create` type per collection and a `Schema` for the SDK.

### Patch Changes

- [`d80a87a`](https://github.com/pouchbase/pouchbase/commit/d80a87a317b9f68345a5450dfde65f5eb1160d5d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a `--port` flag to the Node server and the single binary, next to `PORT` in the environment or `.env`.

## 0.2.0

### Minor Changes

- [`bd0104a`](https://github.com/pouchbase/pouchbase/commit/bd0104afe288707cde47b6289b7a0f6723d3fab5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a **records API** (`/api/collections/<name>/records`) to list, filter, sort, view, create, update and delete records, guarded by PocketBase-style **API rules** per collection. The new **API** panel of a collection sets who may use each action (admins only by default, everyone, signed-in users, the owner, or a custom filter such as `author = @request.auth.id`, written with autocomplete and live error checking), and previews every endpoint with its parameters, example responses and JavaScript SDK and cURL examples.

## 0.1.2

### Patch Changes

- [`cc62e42`](https://github.com/pouchbase/pouchbase/commit/cc62e4263ce3f329607c95dec2215cb53e57f3e8) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Fix deploying to Cloudflare Workers: bundling the Worker failed on the stylesheet and font of the code editor.

## 0.1.1

### Patch Changes

- [`34df8b8`](https://github.com/pouchbase/pouchbase/commit/34df8b8aead2af3aded76298946d7bd321f87c06) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Fix the build of the single binaries, so they are attached to the GitHub release.

- [`34df8b8`](https://github.com/pouchbase/pouchbase/commit/34df8b8aead2af3aded76298946d7bd321f87c06) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Deploy to Cloudflare Workers in one step: `pnpm wrangler deploy --secrets-file .env` stores the Cloudflare credentials as Worker secrets, instead of a separate `wrangler secret put` for each.

## 0.1.0

### Minor Changes

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add an **Admins** page under System that lists the admin accounts and lets you create new ones.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add **Backups** under System: back up the databases, and optionally the uploaded files, to S3-compatible buckets right away or on a cron schedule that keeps a set number of backups, and restore a backup. Scheduled backups run from a Cron Trigger on the Worker or a timer on the Node server, **Find backups** lists the backups already in a bucket, and backups can be downloaded as a `.tar` file and uploaded again, for example to restore into a new installation.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Show the Cloudflare account on the dashboard: the databases and bucket of the installation, the deployed Worker and its bindings, usage graphs for Workers, D1 and R2, and how close the account is to the limits of its Workers plan.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a **Types** page under System with TypeScript types of every collection to copy, and `GET /api/types?token=…` to download them, for example with `npx @pouchbasejs/js-sdk types <url>`. The token can be replaced with **New token**.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a **Computed** field type whose value is calculated whenever a record is saved: from another field as a slug, in lowercase or in uppercase, or with a **script**: JavaScript that returns the value, with the whole `record` and a `ctx` (`collection`, `isNew`, `previous`, `slugify`) available. Scripts are written in a code editor (Monaco) with autocomplete for the collection's fields, hovers and type errors. Scripts run in a QuickJS sandbox without network or database access, limited to 100 ms per record. Existing records get their value when the field is added, a calculation can be tried on recent records and changed later with **Edit computation**, renaming the source field keeps it linked, and a source field can't be deleted while a computed field uses it.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Date fields in the record form use a date picker with a calendar, and JSON fields use a code editor with syntax highlighting and validation.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Pouchbase can now also run as a standalone Node server, next to Cloudflare Workers, with its data still on Cloudflare (D1 and R2). A `Dockerfile` and `docker-compose.yml` are included for self-hosting on your own server.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Manage all fields of a collection in one sheet: add, rename, set required and unique, remove, change how a computed field is calculated, and drag them into a new column order. The same sheet lists the collection's indexes, which can be added, edited and deleted there; the separate Indexes dialog is gone. A new collection opens this sheet right away.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - New collections start without fields: add an **ID** field with the generator of your choice (auto-increment, UUID v4, UUID v7 or a random string) and **Created** and **Updated** timestamp fields only when you need them. Existing collections keep their `id`, `created_at` and `updated_at`, which are now regular fields that can be renamed, reordered and deleted (built-in collections keep theirs). Without an ID field, records are identified by their row number and relation fields can't point to the collection. Date fields accept `@now` as default value: the time the record is created. A default value can also be a **SQL expression** with SQLite's date, time, text, math and JSON functions, such as `datetime('now', '+7 days')` or `lower(hex(randomblob(4)))`, evaluated when a record is created. Expressions are written in an editor with autocomplete for every allowed function (with its signature and a description), keywords, and the time values and modifiers of the date functions. Fields can be changed after they are created: **Edit settings** in the edit collection sheet changes the default value, list items, accepted file types and size, rich text format, id generator and whether a relation or list allows multiple values, keeping the records' data. Field names no longer reserve `id`.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Sign in with your username or email address, both on the admin login page and through `POST /api/auth/password/sign-in` (which now takes `identity`).

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Load pages much faster. The deployed Worker now adds D1 bindings for its databases to itself (keeping its other bindings and secrets) and queries through them instead of the D1 HTTP API, which is roughly ten times faster per query; after a `wrangler deploy` it adds them again on the first request. Related queries are batched into one round-trip, the app database is looked up once, and validated sessions are cached for 30 seconds. Records are read while the collection's fields are checked, instead of after, which saves a round-trip per page. Set `POUCHBASE_LOG_TIMING=true` to log how long every request and database round-trip takes, and whether it went through a binding or the HTTP API.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a **File** field type: a link to a record in `files` that the record form uploads to directly, with a preview in the grid. A File field can limit uploads to file types (images, videos, audio, PDF, documents, archives, or custom MIME types and extensions) and set a maximum file size; both are checked in the form and on the server. The `avatar` of users is now a File field that accepts images; existing installations are converted on the next start.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a built-in `files` collection for uploads, stored in Cloudflare R2. The bucket is created through the Cloudflare API on the first upload, so no binding is needed. Files are uploaded and replaced from the record sheet, served at `/api/files/<id>` (only safe image types inline, everything else as a download), and removed from storage when their record is deleted. Relations to `files` show a preview in the records grid that is enlarged in a tooltip on hover, and the collection can be viewed as a grid of large previews. Thumbnails can be turned on under the collection's new **Settings** with sizes in PocketBase syntax (`100x100`, `300x0`, `800x600f`, ...) and are served with `?thumb=<size>`.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add **Functions** under System: serverless functions written in TypeScript or JavaScript in the admin interface or uploaded as a file, each deployed as a Worker of its own on your Cloudflare account and called on `/api/functions/<name>` with the signed-in app user passed on. Functions have secrets, a version history with restore, logs and a test panel, and can require a signed-in user.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Extend the image editor with saturation, hue, grayscale and sepia, filter presets, more crop ratios, quick scaling, format conversion with JPEG quality, undo/redo and a before/after compare.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add an image editor for PNG, JPEG, GIF and WebP files: crop, rotate, flip, resize, color adjustments (brightness, contrast, saturation, hue, grayscale, sepia) with presets, and a choice of output format and quality. Edits are applied on the server with Photon (WebAssembly) and replace the original; thumbnails are regenerated.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a **List** field type: build its items in the add-field dialog (press Enter to add one, paste several lines at once, drag to reorder) and pick one item, or several with **Allow multiple**, when creating or editing a record. Only items from the list are accepted, and a single item can be the default value.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Show a skeleton of the page while navigating between pages or collections, so the layout stays in place while data loads. Paging and sorting a collection keep the current rows on screen, dimmed, until the new ones are in.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Send email with Cloudflare Email Service or any SMTP server (Settings → Mail), with email verification and password reset for app users

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Relations and files link to the record they point to: click one in the grid or the record sheet to open that record in its collection

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add **Plugins** under System: search the plugin marketplace and install, update or remove plugins. Installs are checked against the plugin's integrity hash, its manifest and the plugin API version. Plugins are built with the new `@pouchbasejs/plugin-sdk` package (manifest schema, types and the `pouchbase-plugin` CLI with `init`, `dev`, `build` and `publish`), and may use any license under the new Pouchbase Plugin Exception. Running what plugins add (field types, pages and sign-in providers) follows in a later release.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add a **Storage** page under System to choose where uploaded files are stored: Cloudflare R2 (the default) or any S3-compatible bucket (Amazon S3, Backblaze B2, MinIO, …). S3 settings are checked by writing a test file before they are saved. After switching, **Move files** copies the existing files to the new storage with a progress bar; until then they are still served from the previous storage.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Run Pouchbase as a single binary, like PocketBase: every release attaches executables for Linux (x64, arm64), macOS (Apple silicon) and Windows that contain Node 26, the app and its static files. Start one with `pouchbase serve --http=0.0.0.0:8090 --origin=https://...`; it reads the Cloudflare credentials from the environment or a `.env` file, and the data stays on Cloudflare D1 and R2.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Show toast notifications when actions succeed or fail, such as saving a record or deleting a collection.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Replace the `avatar_url` field of the built-in `users` collection with `avatar`, a link to an image in `files`. On an OAuth sign-up the provider's profile picture is imported into `files` and linked as the user's avatar. In the record sheet, the avatar and single relations to `files` show a preview and accept a new upload, which is stored in `files` and linked on save. Existing installations get the new field and lose `avatar_url` on the next start.

### Patch Changes

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Buttons inside a form, such as New index in the edit collection sheet, no longer submit the form and close the sheet.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Keep the record sheet open while editing an image, and show the edited image in it after saving.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Separate the layout toggle from the collection actions in the topbar with a divider.

- [`ee260bf`](https://github.com/pouchbase/pouchbase/commit/ee260bf2e3772369d13e3a3badd0d6f59e6073ad) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Refine the admin UI: sheets are docked to the right edge like the sidebar, with a header that lines up with the topbar and a fixed footer for their actions, and slide in and out; controls are more compact with roomier table and sidebar rows, dialogs come in fixed sizes, OAuth providers use their colored brand icons, the add-field dialog opens without waiting for the collection list, and every scrolling area (pages, data grid, dialogs, sheets, the sidebar, tables and select dropdowns, which are now at most 18rem high) uses the same slim custom scrollbar.
