<p align="center">
  <a href="https://pouchbase.io">
    <img src="src/lib/assets/logo.svg" alt="Pouchbase" width="96" height="96" />
  </a>
</p>

<h1 align="center">Pouchbase</h1>

<p align="center">
  An open-source backend on Cloudflare D1 and R2. Runs as a Cloudflare Worker, or on your own server with Docker or as a single binary.
</p>

<p align="center">
  <a href="https://pouchbase.io">Website</a> ·
  <a href="#self-hosting">Self-hosting</a> ·
  <a href="#public-api">API</a>
</p>

> [!NOTE]
> Pouchbase is under active development and not yet ready for production use. APIs, the database schema and the admin interface may change without notice, and no upgrade path between versions is guaranteed yet.

## Features

- Collections, fields and indexes, managed from the admin interface. A records API is planned.
- Built-in user management with username and password sign-in and OAuth (Google, GitHub, Microsoft, Discord and Twitch).
- A built-in `files` collection for uploads.
- A setup wizard that creates the databases and the first admin account.
- A dashboard that shows the Cloudflare resources of the installation, the Worker and its bindings, usage graphs and how close the account is to the limits of its plan.
- The data lives on Cloudflare: D1 for the databases, R2 for files. The app runs as a Cloudflare Worker or as a Node server on your own machine, for example with Docker.
- Backups of the databases (and optionally the uploaded files) to any S3-compatible bucket, right away or on a schedule, and restores from them.
- Serverless functions: write TypeScript or JavaScript in the admin interface, or upload a file, and Pouchbase deploys it as a Worker of its own on your Cloudflare account, with secrets, versions, logs and a test panel.
- Database migrations are applied automatically after each deploy.

## Self-hosting

Pouchbase keeps its data on Cloudflare (D1 databases and an R2 bucket, all through the REST API), whichever way you run the app itself. Every option needs a Cloudflare account and an API token with the following account-level permissions: Workers Scripts, D1, Workers R2 Storage and Workers KV Storage (Edit), and Account Settings (Read). To see the logs of [functions](#functions), add Workers Observability (Edit). Copy `.env.example` to `.env` and set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; use `pnpm cf:whoami` to verify the account.

**Run it as a Cloudflare Worker when speed matters.** A Worker queries D1 through bindings, inside Cloudflare's network (see [How installation works](#how-installation-works)). On Node, Docker and the single binary, every database round-trip goes through the D1 HTTP API, which takes a few hundred milliseconds each; the public API and the SDK are just as slow there. To check, set `POUCHBASE_LOG_TIMING=true`: every `[db]` line says whether the query went through a `binding` or the `api`.

Whichever you choose, the first visit redirects to `/install`, which creates the databases and the admin account.

### Cloudflare Workers

Requirements: Node 22 or later and pnpm 10 (`corepack enable`).

1. Clone the repository and install the dependencies:

   ```bash
   git clone https://github.com/pouchbase/pouchbase.git
   cd pouchbase
   pnpm install
   ```

2. Copy `.env.example` to `.env` and fill in `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (the comments there list the permissions the token needs).

3. Build and deploy the Worker. `--secrets-file .env` stores the variables from `.env` as Worker secrets in the same step:

   ```bash
   pnpm build
   pnpm wrangler deploy --secrets-file .env
   ```

   Secrets stay on the Worker across deploys; pass `--secrets-file .env` again when you change them.

4. Open the Worker URL.

### Docker Compose

Requirements: Docker with Compose, and the `.env` file from above next to `docker-compose.yml` (Compose reads the credentials from it).

```bash
git clone https://github.com/pouchbase/pouchbase.git
cd pouchbase
ORIGIN=https://pouchbase.example.com docker compose up -d
```

`ORIGIN` is the public URL of the instance and defaults to `http://localhost:3000`. For anything but local use, put a reverse proxy with HTTPS (Caddy, Traefik, nginx) in front of port 3000: the session cookie is only sent over HTTPS, except on `localhost`.

### Docker

Every release publishes an image for `linux/amd64` and `linux/arm64` to GitHub Container Registry, tagged with its version (`0.2.1`, `0.2`) and `latest`. To build it yourself instead, run `docker build -t pouchbase .` and use `pouchbase` as the image name.

```bash
docker run -d --name pouchbase -p 3000:3000 \
  -e ORIGIN=https://pouchbase.example.com \
  -e CLOUDFLARE_ACCOUNT_ID=... \
  -e CLOUDFLARE_API_TOKEN=... \
  ghcr.io/pouchbase/pouchbase:latest
```

| Variable                | Default     | Description                                                                                                                |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | –           | Cloudflare account that holds the D1 databases and the R2 bucket                                                           |
| `CLOUDFLARE_API_TOKEN`  | –           | API token with the permissions listed above                                                                                |
| `ORIGIN`                | –           | Public URL of the instance, used for redirects and OAuth callbacks                                                         |
| `PORT`                  | `3000`      | Port the server listens on                                                                                                 |
| `BODY_SIZE_LIMIT`       | `16M`       | Largest accepted request body (uploads are limited to 10 MB by the app)                                                    |
| `POUCHBASE_INSTANCE`    | `pouchbase` | Name of the instance on the Cloudflare account (see [Several instances on one account](#several-instances-on-one-account)) |
| `POUCHBASE_LOG_TIMING`  | `false`     | `true` logs the duration of every request and database round-trip                                                          |

The image answers a health check at `/api/health`. The same build runs without Docker on Node 26 or later: `pnpm install`, `pnpm build:node`, then `node server.mjs` with the variables above. Behind a reverse proxy that sends `x-forwarded-proto` and `x-forwarded-host`, `ORIGIN` can be left out.

### Single binary

Pouchbase also comes as one executable without dependencies: every release attaches `pouchbase-linux-x64`, `pouchbase-linux-arm64`, `pouchbase-macos-arm64` and `pouchbase-windows-x64.exe`. Each one contains Node 26, the app and its static files. The data still lives on Cloudflare, so the binary keeps no files of its own.

```bash
chmod +x pouchbase-linux-x64
./pouchbase-linux-x64 serve --http=0.0.0.0:8090 --origin=https://pouchbase.example.com
```

The binary reads `.env` from the working directory (or the file passed with `--env-file`), so put `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` there or in the environment. `--http`, `--port`, `--origin` and `--instance` override `HOST`, `PORT`, `ORIGIN` and `POUCHBASE_INSTANCE` (`--port=3001` changes only the port); the other variables from the table above apply as well. Run `pouchbase --help` for all flags. On Linux the binary needs `libatomic1`, which most distributions install by default (on minimal images such as `debian:slim`, install it with `apt-get install libatomic1`).

To build a binary for your own platform, run `pnpm build:binary` with Node 26; it is written to `dist/`.

### Several instances on one account

Every instance finds its data through its system database, which is named after the instance (`POUCHBASE_INSTANCE`, default `pouchbase`); the app database and the R2 bucket are recorded in it. Two instances with the same name and the same Cloudflare credentials are therefore the same installation, with the same users and data, whether they run as a Worker, in Docker or as a binary. To host several separate instances on one Cloudflare account, give each one its own name: lowercase letters, digits and dashes, at most 19 characters. The name is also the prefix of its function Workers (`<instance>-fn-<name>`).

```bash
./pouchbase-linux-x64 serve --port=3001 --instance=shop
./pouchbase-linux-x64 serve --port=3002 --instance=blog
```

On Workers the instance name is the Worker's name as well, so deploy each instance under its own name and pass the same value: `pnpm wrangler deploy --name shop --var POUCHBASE_INSTANCE:shop --secrets-file .env`.

## Development

```bash
pnpm install
pnpm dev          # app on http://localhost:5173, site on http://localhost:5174
```

The dev server uses the Cloudflare credentials from `.env`: development also runs against D1 and R2.

| Script              | Description                                                    |
| ------------------- | -------------------------------------------------------------- |
| `pnpm dev`          | Start the app and the site dev servers                         |
| `pnpm dev:app`      | Start only the app dev server                                  |
| `pnpm dev:site`     | Start only the site dev server                                 |
| `pnpm build`        | Production build for Cloudflare Workers                        |
| `pnpm build:node`   | Production build for Node (what the Docker image runs)         |
| `pnpm build:binary` | Single binary for the current platform in `dist/` (Node 26)    |
| `pnpm preview`      | Run the Cloudflare build locally with Wrangler                 |
| `pnpm preview:node` | Run the Node build locally (`node server.mjs`)                 |
| `pnpm check`        | Type-check the project                                         |
| `pnpm lint`         | Run Prettier and ESLint                                        |
| `pnpm format`       | Format the code with Prettier                                  |
| `pnpm gen`          | Regenerate Cloudflare types after changing `wrangler.jsonc`    |
| `pnpm db:generate`  | Generate Drizzle migrations after changing the database schema |

Pouchbase is built with SvelteKit (Svelte 5, TypeScript), bits-ui and Drizzle ORM. The build target (`POUCHBASE_TARGET`, see `vite.config.ts`) picks the adapter (`@sveltejs/adapter-cloudflare` or `@sveltejs/adapter-node`). The platform drivers in `src/lib/server/platform/` talk to D1 and R2 through the Cloudflare REST API, so they work from a Worker and from Node alike. Services never talk to a platform directly, so everything else is shared.

## How installation works

On first launch the app redirects to `/install`, a two-step wizard:

1. **Account**: creates two D1 databases through the Cloudflare API and then the admin account. You are logged in right away.
   - the **system database** (users, sessions, settings), named after the instance: `pouchbase` unless `POUCHBASE_INSTANCE` says otherwise. Its migrations come from `./drizzle`.
   - the **app database**, with a random name like `pb-k3x9q0w2m7a1`. It holds the data of the app you build on Pouchbase. Its id and name are stored in the system database's `settings` (`app_database_id`, `app_database_name`).
2. **App settings**: choose the app name. This completes the installation.

The databases are created during installation, so `wrangler.jsonc` has **no D1 binding**. Queries go through the D1 HTTP API using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (see `src/env.ts` and `src/lib/server/platform/cloudflare/`), which is what lets the same app run on a Worker and on your own server. On Workers they are stored as secrets (see [Self-hosting](#self-hosting)).

The deployed Worker then adds a D1 binding per database to itself through the API (named `D1_<DATABASE_ID>`, keeping its other bindings and secrets), which deploys a new version; from then on queries use the bindings, which is roughly ten times faster than the HTTP API. A `wrangler deploy` replaces the bindings with those in `wrangler.jsonc`, so the Worker adds them again on its first request after a deploy, using the HTTP API until the new version is live.

The schema lives in `src/lib/server/db/schema.ts` (Drizzle). After changing it, run `pnpm db:generate`. New migrations are applied during installation, and on existing installations automatically on the first request after a deploy.

## App users & authentication

Every installation has a built-in `users` collection for the users of **your app** (separate from the Pouchbase admin account). It has the auth fields `email` and `username` (both unique), `name`, `avatar` (a relation to `files`) and `verified`, which can't be renamed or deleted; you can add your own fields. Password hashes are stored in an internal table, never in `users`.

On the **Authentication** page (sidebar → System) you activate the sign-in methods:

- **Username & password**, optionally with self sign-up. Set a user's password in the `users` collection.
- **OAuth**: Google, GitHub, Microsoft, Discord and Twitch. Create an OAuth app at the provider, register the **callback URL** shown in the setup dialog, then enter the client ID and secret.

### Mail

Verification and password reset emails need mail settings (**Settings → Mail**), with a test button to check them:

- **Cloudflare Email Service**: uses the app's own `CLOUDFLARE_API_TOKEN`, which then also needs **Email Sending: Edit**. Onboard the sender's domain under Email Service → Email Sending first. Pouchbase uses the REST API here, on every runtime: the Email Service SMTP endpoint (`smtp.mx.cloudflare.net`) is on Cloudflare's own IP ranges, which Workers can't open sockets to.
- **SMTP server**: any provider, with TLS (port 465), STARTTLS (587) or no encryption. Workers can't connect to port 25.

With mail set up, a sign-up with an email address sends a verification email. The links open pages of Pouchbase itself (`/account/verify-email`, `/account/reset-password`); reset links are valid for 30 minutes and work once, verification links for 3 days.

### Public API

Every sign-in returns `{ token, user_id }`. Send the token as `Authorization: Bearer <token>`; it is a JWT (HS256), valid for 7 days. The API can be called from any origin.

| Request                                               | Purpose                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/auth/providers`                             | Active OAuth providers: `[{ "provider": "github", "label": "GitHub" }]`       |
| `POST /api/auth/password/sign-up`                     | `{ username, password, email?, name? }`; `400`/`409` with `issues` per field  |
| `POST /api/auth/password/sign-in`                     | `{ identity, password }` (username or email); `401` for wrong credentials     |
| `POST /api/auth/password/request-reset`               | `{ email }`; emails a reset link (same answer for unknown addresses)          |
| `POST /api/auth/password/confirm-reset`               | `{ token, password }`; `400` for an invalid or expired link                   |
| `POST /api/auth/verification/request`                 | `{ email }`; emails a verification link                                       |
| `POST /api/auth/verification/confirm`                 | `{ token }`; marks the user as `verified`                                     |
| `GET /api/auth/oauth2/<provider>?state=…&challenge=…` | Opened in a popup; starts an OAuth sign-in                                    |
| `POST /api/auth/oauth2/result`                        | `{ state, verifier }`: `202` while pending, then the result once              |
| `GET /api/auth/me`                                    | The signed-in user, or `401`                                                  |
| `GET /api/collections/<name>/records`                 | Records the list rule allows; `?page`, `perPage`, `sort`, `filter`            |
| `GET /api/collections/<name>/records/<id>`            | One record, when the view rule allows it                                      |
| `POST /api/collections/<name>/records`                | `{ <field>: value }`; creates a record when the create rule allows it         |
| `PATCH /api/collections/<name>/records/<id>`          | Changes the given fields, when the update rule allows it                      |
| `DELETE /api/collections/<name>/records/<id>`         | Deletes a record when the delete rule allows it; `204`                        |
| `GET /api/files/<id>`                                 | A file from the `files` collection (public; ids are random)                   |
| `GET /api/types?token=…`                              | TypeScript types of every collection; the URL is on the **Types** page        |
| `<any method> /api/functions/<name>/<path>`           | Calls a [function](#functions); `401` when it requires sign-in, `404` if none |

### Records API and API rules

Every collection has a records API at `/api/collections/<name>/records`, guarded by the collection's **API rules** (the **API** button of the collection, under **Access rules**), one per action: list/search, view, create, update and delete. Each rule is one of:

- **Admins only** (the default): not available through the API; only admins, in the dashboard.
- **Everyone**: also without signing in.
- **Signed-in users**: any request with a valid token (`@request.auth.id != ""`).
- **Owner**: only the user in a relation field to `users`, such as `author = @request.auth.id` (in `users`: the user themselves).
- **Custom rule**: a filter, and only records that match it are allowed, e.g. `status = "published" || author = @request.auth.id`. The list rule filters the results; the create rule is checked against the new record. The editor suggests fields as you type and underlines mistakes.

Filters (`?filter=` and rules) use field names, `"strings"`, numbers, `true`/`false`, `null`, `@now`, `@request.auth.<field>` (the signed-in user; `""` when signed out) and `@request.body.<field>` (submitted values), with `=`, `!=`, `>`, `>=`, `<`, `<=`, `~` (contains), `!~`, the same with `?` in front for any item of a multiple relation or list (`tags ?= "news"`), `&&`, `||` and parentheses. `?sort=-created_at,title` sorts; `-` means descending.

Records come back with real values: booleans as `true`/`false`, JSON fields parsed, and multiple relations, files and lists as arrays (`[]` when empty); blob fields are left out. `?fields=id,title` returns only those fields. `users` can't be created through the API (use sign-up), and its `email` and `verified` can't be changed there; `files` can only be listed, viewed and deleted. The **Preview** tab of the same panel shows every endpoint with SDK and cURL examples for its fields.

### OAuth from your app

The token is never put in a URL: the app proves it started the sign-in with a secret PKCE verifier. Open the popup synchronously in the click handler, otherwise browsers block it:

```js
const POUCHBASE = 'https://your-pouchbase.example.com';

const random = (bytes) =>
	btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

async function signInWith(provider) {
	const popup = window.open('', 'pouchbase-oauth', 'width=500,height=700');
	const state = random(24);
	const verifier = random(32);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

	popup.location = `${POUCHBASE}/api/auth/oauth2/${provider}?state=${state}&challenge=${challenge}`;

	for (let i = 0; i < 300; i++) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const response = await fetch(`${POUCHBASE}/api/auth/oauth2/result`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state, verifier })
		});

		if (response.status === 202) continue;

		const result = await response.json();
		if (result.status === 'done') return result; // { status, token, user_id }
		throw new Error(result.error ?? result.message); // access_denied, email_in_use, sign_in_failed
	}

	throw new Error('Sign-in timed out');
}
```

A sign-in is linked to an existing user with the same email only when the provider verified that email (Google, GitHub's verified emails and Discord do; Microsoft and Twitch don't), so nobody can take over an account by claiming its address.

## Files

The built-in `files` collection holds uploads. Pouchbase creates an R2 bucket for it through the Cloudflare API on the first upload (random name, stored in the settings), so no binding is needed. Under **System → Storage** you can store uploads in any S3-compatible bucket instead (Amazon S3, Backblaze B2, MinIO, …); after switching, **Move files** copies the existing files over (they are served from the previous storage until then). Each record has the managed fields `name`, `mime_type`, `size`, `key` and `thumbnails`; you can add your own fields. To attach files to a record, add a **File** field: the record form uploads straight into `files` and links the new file, like `users.avatar`. A File field can limit uploads to file types (images, videos, audio, PDF, documents, archives, or your own MIME types and extensions such as `application/json` or `.md`) and set a maximum size of up to 10 MB. A relation to `files` still works for linking existing files. On an OAuth sign-up, the provider's profile picture is stored as the user's avatar.

Uploads are limited to 10 MB. Files are served at `/api/files/<id>`; only PNG, JPEG, GIF, WebP and AVIF images are shown inline, every other type is downloaded, so uploaded HTML or SVG can't run scripts on the admin's domain.

In the admin, `files` can be shown as a table or as a grid with large previews. PNG, JPEG, GIF and WebP images can be edited (crop, rotate, flip, resize, brightness and contrast); the edit replaces the original and is processed on the server with WebAssembly ([Photon](https://github.com/silvia-odwyer/photon)).

### Thumbnails

Under **Settings** on the `files` collection you can turn on thumbnails and list the sizes to generate:

| Size   | Result                                |
| ------ | ------------------------------------- |
| `WxH`  | Crops to fill W×H, from the center    |
| `WxHt` | Crops to fill W×H, from the top       |
| `WxHb` | Crops to fill W×H, from the bottom    |
| `WxHf` | Fits inside W×H without cropping      |
| `Wx0`  | Scales to width W, keeping the ratio  |
| `0xH`  | Scales to height H, keeping the ratio |

Images are never enlarged. Thumbnails are made on upload and on the first request at `/api/files/<id>?thumb=<size>`; a size that isn't in the list serves the original.

## Backups

Under **System → Backups** you add one or more S3-compatible buckets as destinations (Amazon S3, Cloudflare R2, Backblaze B2, MinIO, …), make a backup right away and set up schedules with a cron expression (UTC) and how many backups to keep. A backup is an export of the system and app databases (D1 SQL dumps, made by Cloudflare) in a folder `<folder>/<date>-<id>/` of the bucket, with a `manifest.json`. With **Include files**, uploaded files are copied to `<folder>/files/` as well; files that are already there aren't copied again, and they are never removed there, so every backup can be restored.

Scheduled backups run once a minute from a Cron Trigger on the Worker (`wrangler.jsonc`; `pnpm build` adds the `scheduled` handler with `scripts/worker-entry.mjs`) or from a timer in `server.mjs` on Node. Both call `POST /internal/tick` with a token derived from `CLOUDFLARE_API_TOKEN`. In `pnpm dev` there is no scheduler; backups started from the page run while it is open.

**Restore** loads the app database of a backup into a new D1 database while the app keeps using the current one: dumps up to 32 MB with D1's import, larger ones in chunks of 2 MB that are read with range requests and run as batches, so a restore stays within the memory and CPU limits of a Worker. Restoring the system database then switches to the new app database in the same transaction; until then a failed restore changes nothing. The replaced app database is deleted ten minutes later. Files are copied back last, if you choose to. Backups, schedules, destinations and the sessions of admins that exist in the backup are kept as they are. **Find backups** on a destination lists the backups in its bucket that Pouchbase doesn't know yet, for example to restore into a new installation.

**Download** saves a completed backup as one `.tar` file (`manifest.json`, `system.sql` and `app.sql`; uploaded files aren't included), streamed from the bucket. **Upload backup** adds such a file to a destination, so it can be restored there, also in another installation. The browser reads the archive and sends the databases in parts of 8 MB, which the server uploads to the bucket as a multipart upload, so the size isn't limited by the request body limit.

## Functions

Under **System → Functions** you create serverless functions, like Supabase Edge Functions. A function is one ES module whose default export has a `fetch(request, env, ctx)` handler, the same as a Cloudflare Worker. Write it in TypeScript or JavaScript in the editor, or upload a `.js`/`.ts` file; TypeScript is compiled to JavaScript in the browser. To use npm packages, bundle them into one file first (for example `esbuild --bundle --format=esm`).

Every deploy uploads the code as a Worker of its own, `<instance>-fn-<name>` (`pouchbase-fn-<name>` by default), on the same Cloudflare account, and is kept as a version that can be restored. Apps call a function on `/api/functions/<name>`; the method, headers, body and the rest of the path and query string are passed on. Pouchbase checks the bearer token of an app user and passes the user on: `pouchbaseUser(request)` returns it in the function, or `null`. A function that requires sign-in answers `401` without a valid token. Secrets are set on the Worker (Cloudflare stores them encrypted) and are in `env`, next to `env.POUCHBASE_URL`. The Logs tab reads Workers Logs through the Workers Observability API, and the Test tab sends requests to the deployed version.

The Worker answers on its `workers.dev` URL, but only to requests that carry the function's secret, which only Pouchbase knows; the account needs a `workers.dev` subdomain (open Workers & Pages in the Cloudflare dashboard once). The Pouchbase Worker reaches the function Workers with the `global_fetch_strictly_public` compatibility flag. Responses are served from the admin's domain, so they get `Content-Security-Policy: sandbox`: HTML from a function can't run scripts there. Browsers on other sites can't post HTML forms to a function (SvelteKit's CSRF protection); JSON requests and calls from servers, such as webhooks, work.

## Plugins

The **Plugins** page (under System) searches the plugin marketplace and installs, updates and removes plugins. Plugins add field types, dashboard pages and sign-in providers; running them is in development, so installed plugins are stored but don't run yet.

Plugins are built with [`@pouchbasejs/plugin-sdk`](packages/plugin-sdk), which holds the plugin contract (manifest, bundle format, registry API) and the `pouchbase-plugin` CLI. Installs are checked against the integrity hash from the registry, the manifest rules and the plugin API version. Set `PLUGIN_REGISTRY_URL` to use another registry than the public one, for example the local registry that `pouchbase-plugin dev` runs while you develop a plugin.

## License

Pouchbase is licensed under the [GNU Affero General Public License v3.0](LICENSE). Apps that only talk to Pouchbase through its API are not affected by this license; modified versions of Pouchbase that are offered as a network service must make their source code available under the same license.

Plugins are covered by the [Pouchbase Plugin Exception](PLUGIN-EXCEPTION.md): a plugin that only uses the plugin API may be distributed under any license, including a proprietary one. The plugin SDK (`@pouchbasejs/plugin-sdk`, in `packages/plugin-sdk`) and the JavaScript SDK (`@pouchbasejs/js-sdk`, in `packages/js-sdk`) are licensed under the MIT license. The website in `site/` is not open source: all rights reserved.
