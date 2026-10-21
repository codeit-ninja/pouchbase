# Pouchbase

SvelteKit 3 app (Svelte 5, TypeScript) with bits-ui and runed, deployed on Cloudflare Workers via `@sveltejs/adapter-cloudflare`.

## Getting started

Requires Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Other scripts: `pnpm build`, `pnpm preview` (via wrangler), `pnpm check`, `pnpm lint`, `pnpm format`, `pnpm gen` (regenerate Cloudflare types after changing `wrangler.jsonc`), `pnpm db:generate` (generate Drizzle migrations).

## Cloudflare account

Wrangler uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from `.env` (see `.env.example`), so resources are created on that account without `wrangler login`.

```bash
cp .env.example .env   # fill in your credentials
pnpm cf:whoami         # check which account you're on
```

## Installation & database

On first launch the app redirects to `/install`, a two-step wizard:

1. **Account**: creates two D1 databases through the Cloudflare API and then the admin account. You are logged in right away.
   - `pouchbase`, the **system database** (users, sessions, settings). Its migrations come from `./drizzle`.
   - the **app database**, with a random name like `pb-k3x9q0w2m7a1`. It holds the data of the app you build on Pouchbase, like PocketBase's data store. Its id and name are stored in the system database's `settings` (`app_database_id`, `app_database_name`).
2. **App settings**: choose the app name. This completes the installation.

The app uses **no D1 binding**. All queries go through the D1 HTTP API using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (see `src/env.ts` and `src/lib/server/cloudflare/d1.ts`). In production, set them as Worker secrets:

```bash
pnpm wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm wrangler secret put CLOUDFLARE_API_TOKEN
```

The schema lives in `src/lib/server/db/schema.ts` (Drizzle). After changing it, run `pnpm db:generate`. New migrations are applied during installation, and on existing installations automatically on the first request after a deploy.

API token permissions (account level): Workers Scripts, D1, Workers R2 Storage and Workers KV Storage set to **Edit**, Account Settings set to **Read**.

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

## Claude Code

- `.mcp.json`: official Svelte MCP server (https://mcp.svelte.dev/mcp)
- `.claude/`: Svelte skills, the `svelte-file-editor` agent and the `pouchbase-components` skill with the project's component rules
