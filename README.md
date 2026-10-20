# Pouchbase

SvelteKit 3-app (Svelte 5, TypeScript) met bits-ui en runed, gedeployed op Cloudflare Workers via `@sveltejs/adapter-cloudflare`.

## Starten

Vereist Node 22+ en pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Overige scripts: `pnpm build`, `pnpm preview` (via wrangler), `pnpm check`, `pnpm lint`, `pnpm format`, `pnpm gen` (Cloudflare-types bijwerken na wijzigingen in `wrangler.jsonc`).

## Claude Code

- `.mcp.json`: officiële Svelte MCP-server (https://mcp.svelte.dev/mcp)
- `.claude/`: Svelte-skills en de `svelte-file-editor`-agent
