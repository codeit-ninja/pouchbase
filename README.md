<div align="center">
  <a href="https://pouchbase.io">
    <img src="src/lib/assets/logo.svg" alt="Pouchbase logo" width="120" height="120" />
  </a>

  <h1>Pouchbase</h1>

  <p><strong>A PocketBase-style backend that lives entirely on Cloudflare.</strong><br />
  Collections, records and auth, running on Workers and D1. No servers to babysit.</p>

  <p>
    <a href="https://pouchbase.io"><strong>pouchbase.io</strong></a>
    ·
    <a href="#-self-hosting">Self-hosting</a>
    ·
    <a href="#public-api">API</a>
  </p>

  <p>
    <img alt="Status: work in progress" src="https://img.shields.io/badge/status-work%20in%20progress-F6821F" />
    <img alt="Runs on Cloudflare Workers" src="https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-FBAD41?logo=cloudflare&logoColor=white" />
    <img alt="Built with SvelteKit" src="https://img.shields.io/badge/built%20with-SvelteKit-FF3E00?logo=svelte&logoColor=white" />
  </p>
</div>

> [!WARNING]
> **Pouchbase is a work in progress.** Things will change and break between commits, and there is no stable release or migration path yet. Feel free to try it out, but don't trust it with production data just yet.

## ✨ What you get

- 🗂️ **Collections & records** – define collections, fields and indexes and manage records in the admin UI. A records API for your app is on the way.
- 🔐 **Auth built in** – username & password and OAuth (Google, GitHub, Microsoft, Discord, Twitch) for the users of your app.
- 🧙 **One-minute install** – a setup wizard creates the D1 databases and your admin account for you.
- ☁️ **Serverless by design** – runs on Cloudflare Workers with D1 as storage, so it scales down to zero and up to a lot.
- 🔄 **Automatic migrations** – schema updates are applied on the first request after a deploy.

## 🚀 Self-hosting

All you need is a Cloudflare account (the free plan is fine to start), Node 22+ and pnpm 10 (`corepack enable`).

**1. Get the code**

```bash
git clone https://github.com/pouchbase/pouchbase.git
cd pouchbase
pnpm install
```

**2. Add your Cloudflare credentials**

```bash
cp .env.example .env
```

Fill in `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token needs these account-level permissions: Workers Scripts, D1, Workers R2 Storage and Workers KV Storage set to **Edit**, Account Settings set to **Read**. Run `pnpm cf:whoami` to check which account you're on.

**3. Deploy to Workers**

```bash
pnpm build
pnpm wrangler deploy
pnpm wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm wrangler secret put CLOUDFLARE_API_TOKEN
```

**4. Run the installer**

Open your Worker's URL (for example `https://pouchbase.<your-subdomain>.workers.dev`). You'll be sent to `/install`, which creates the databases and your admin account. That's it! 🎉

## 🛠️ Development

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Other scripts: `pnpm build`, `pnpm preview` (via wrangler), `pnpm check`, `pnpm lint`, `pnpm format`, `pnpm gen` (regenerate Cloudflare types after changing `wrangler.jsonc`), `pnpm db:generate` (generate Drizzle migrations).

Built with SvelteKit 3 (Svelte 5, TypeScript), bits-ui and runed, deployed through `@sveltejs/adapter-cloudflare`.

## 📚 Reference

### How installation works

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

### App users & authentication

Every installation has a built-in `users` collection for the users of **your app** (separate from the Pouchbase admin account). It has the auth fields `email` and `username` (both unique), `name`, `avatar_url` and `verified`, which can't be renamed or deleted; you can add your own fields. Password hashes are stored in an internal table, never in `users`.

On the **Authentication** page (sidebar → System) you activate the sign-in methods:

- **Username & password**, optionally with self sign-up. Set a user's password in the `users` collection.
- **OAuth**: Google, GitHub, Microsoft, Discord and Twitch. Create an OAuth app at the provider, register the **callback URL** shown in the setup dialog, then enter the client ID and secret.

#### Public API

Every sign-in returns `{ token, user_id }`. Send the token as `Authorization: Bearer <token>`; it is a JWT (HS256), valid for 7 days. Like PocketBase, the API can be called from any origin.

| Request                                               | Purpose                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/auth/providers`                             | Active OAuth providers: `[{ "provider": "github", "label": "GitHub" }]`      |
| `POST /api/auth/password/sign-up`                     | `{ username, password, email?, name? }`; `400`/`409` with `issues` per field |
| `POST /api/auth/password/sign-in`                     | `{ username, password }`; `401` for a wrong username or password             |
| `GET /api/auth/oauth2/<provider>?state=…&challenge=…` | Opened in a popup; starts an OAuth sign-in                                   |
| `POST /api/auth/oauth2/result`                        | `{ state, verifier }`: `202` while pending, then the result once             |
| `GET /api/auth/me`                                    | The signed-in user, or `401`                                                 |

#### OAuth from your app

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

### AI tooling

- `.mcp.json`: official Svelte MCP server (https://mcp.svelte.dev/mcp)
- `.claude/`: Svelte skills, the `svelte-file-editor` agent and the `pouchbase-components` skill with the project's component rules

---

<div align="center">
  <sub>Made with 🧡 by the Pouchbase team · <a href="https://pouchbase.io">pouchbase.io</a></sub>
</div>
