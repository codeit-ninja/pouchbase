---
'pouchbase': patch
---

Fix the Worker ignoring its D1 bindings and cutting off work that runs after a response (adding the bindings, verification emails): SvelteKit 3 no longer passes the Cloudflare platform to requests, so the Worker now reads its bindings from `cloudflare:workers`. Queries on Workers go through the bindings again instead of the slower D1 HTTP API.
