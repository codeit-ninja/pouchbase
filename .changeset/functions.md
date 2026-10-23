---
'pouchbase': minor
---

Add **Functions** under System: serverless functions written in TypeScript or JavaScript in the admin interface or uploaded as a file, each deployed as a Worker of its own on your Cloudflare account and called on `/api/functions/<name>` with the signed-in app user passed on. Functions have secrets, a version history with restore, logs and a test panel, and can require a signed-in user.
