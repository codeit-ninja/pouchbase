---
'pouchbase': patch
---

Deploy to Cloudflare Workers in one step: `pnpm wrangler deploy --secrets-file .env` stores the Cloudflare credentials as Worker secrets, instead of a separate `wrangler secret put` for each.
