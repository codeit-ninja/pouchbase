<p align="center">
  <a href="https://pouchbase.io">
    <img src="src/lib/assets/logo.svg" alt="Pouchbase" width="96" height="96" />
  </a>
</p>

<h1 align="center">Pouchbase</h1>

<p align="center">
  An open-source backend for Cloudflare Workers and D1, inspired by PocketBase.
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
- A setup wizard that provisions the D1 databases and the first admin account.
- Runs entirely on Cloudflare Workers, with D1 as the database.
- Database migrations are applied automatically after each deploy.

## Self-hosting

Requirements: a Cloudflare account, Node 22 or later and pnpm 10 (`corepack enable`).

1. Clone the repository and install the dependencies:

   ```bash
   git clone https://github.com/pouchbase/pouchbase.git
   cd pouchbase
   pnpm install
   ```

2. Copy `.env.example` to `.env` and set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The API token needs the following account-level permissions: Workers Scripts, D1, Workers R2 Storage and Workers KV Storage (Edit), and Account Settings (Read). Use `pnpm cf:whoami` to verify the account.

3. Build and deploy the Worker, then store the credentials as Worker secrets:

   ```bash
   pnpm build
   pnpm wrangler deploy
   pnpm wrangler secret put CLOUDFLARE_ACCOUNT_ID
   pnpm wrangler secret put CLOUDFLARE_API_TOKEN
   ```

4. Open the Worker URL. On first launch you are redirected to `/install`, which creates the databases and the admin account.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

| Script             | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `pnpm build`       | Production build                                               |
| `pnpm preview`     | Run the production build locally with Wrangler                 |
| `pnpm check`       | Type-check the project                                         |
| `pnpm lint`        | Run Prettier and ESLint                                        |
| `pnpm format`      | Format the code with Prettier                                  |
| `pnpm gen`         | Regenerate Cloudflare types after changing `wrangler.jsonc`    |
| `pnpm db:generate` | Generate Drizzle migrations after changing the database schema |

Pouchbase is built with SvelteKit (Svelte 5, TypeScript), bits-ui and Drizzle ORM, and deployed with `@sveltejs/adapter-cloudflare`.

## How installation works

On first launch the app redirects to `/install`, a two-step wizard:

1. **Account**: creates two D1 databases through the Cloudflare API and then the admin account. You are logged in right away.
   - `pouchbase`, the **system database** (users, sessions, settings). Its migrations come from `./drizzle`.
   - the **app database**, with a random name like `pb-k3x9q0w2m7a1`. It holds the data of the app you build on Pouchbase, like PocketBase's data store. Its id and name are stored in the system database's `settings` (`app_database_id`, `app_database_name`).
2. **App settings**: choose the app name. This completes the installation.

The app uses **no D1 binding**. All queries go through the D1 HTTP API using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (see `src/env.ts` and `src/lib/server/cloudflare/d1.ts`). In production they are stored as Worker secrets (see [Self-hosting](#self-hosting)).

The schema lives in `src/lib/server/db/schema.ts` (Drizzle). After changing it, run `pnpm db:generate`. New migrations are applied during installation, and on existing installations automatically on the first request after a deploy.

## App users & authentication

Every installation has a built-in `users` collection for the users of **your app** (separate from the Pouchbase admin account). It has the auth fields `email` and `username` (both unique), `name`, `avatar_url` and `verified`, which can't be renamed or deleted; you can add your own fields. Password hashes are stored in an internal table, never in `users`.

On the **Authentication** page (sidebar → System) you activate the sign-in methods:

- **Username & password**, optionally with self sign-up. Set a user's password in the `users` collection.
- **OAuth**: Google, GitHub, Microsoft, Discord and Twitch. Create an OAuth app at the provider, register the **callback URL** shown in the setup dialog, then enter the client ID and secret.

### Public API

Every sign-in returns `{ token, user_id }`. Send the token as `Authorization: Bearer <token>`; it is a JWT (HS256), valid for 7 days. Like PocketBase, the API can be called from any origin.

| Request                                               | Purpose                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/auth/providers`                             | Active OAuth providers: `[{ "provider": "github", "label": "GitHub" }]`      |
| `POST /api/auth/password/sign-up`                     | `{ username, password, email?, name? }`; `400`/`409` with `issues` per field |
| `POST /api/auth/password/sign-in`                     | `{ username, password }`; `401` for a wrong username or password             |
| `GET /api/auth/oauth2/<provider>?state=…&challenge=…` | Opened in a popup; starts an OAuth sign-in                                   |
| `POST /api/auth/oauth2/result`                        | `{ state, verifier }`: `202` while pending, then the result once             |
| `GET /api/auth/me`                                    | The signed-in user, or `401`                                                 |

### OAuth from your app

The token is never put in a URL: the app proves it started the sign-in with a secret PKCE verifier (same model as PocketBase). Open the popup synchronously in the click handler, otherwise browsers block it:

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

## License

Pouchbase is licensed under the [GNU Affero General Public License v3.0](LICENSE). Apps that only talk to Pouchbase through its API are not affected by this license; modified versions of Pouchbase that are offered as a network service must make their source code available under the same license.
