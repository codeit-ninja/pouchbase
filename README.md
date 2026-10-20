# PocketBase alternative (Cloudflare)

Turborepo-monorepo met pnpm workspaces.

```
apps/
  web/          SvelteKit 3 + Svelte 5, bits-ui, runed, PocketBase JS SDK (adapter-cloudflare)
  pocketbase/   lokale PocketBase-backend (SaaS-backend)
packages/       ruimte voor npm-packages (CLI, JS client SDK, …)
.claude/        Svelte-skills en -agent voor Claude Code
.mcp.json       officiële Svelte MCP-server (https://mcp.svelte.dev/mcp)
```

## Starten

Vereist Node 22+ en pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # web (http://localhost:5173) + PocketBase (http://127.0.0.1:8090) tegelijk
pnpm web:dev      # alleen de website
pnpm pb:dev       # alleen PocketBase (binary wordt bij de eerste start gedownload)
```

Overige taken via Turborepo: `pnpm build`, `pnpm check`, `pnpm lint`, `pnpm format`.

De web-app leest `POCKETBASE_URL` (zie `apps/web/src/env.ts`, standaard `http://127.0.0.1:8090`).

## Nieuwe package toevoegen

Maak `packages/<naam>/package.json` aan (bijv. `"name": "@repo/sdk"`) met een `build`-script.
Gebruik hem in een app via `"@repo/sdk": "workspace:*"` en `pnpm install`.
