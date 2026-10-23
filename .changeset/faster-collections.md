---
'pouchbase': minor
---

Load pages much faster. The deployed Worker now adds D1 bindings for its databases to itself (keeping its other bindings and secrets) and queries through them instead of the D1 HTTP API, which is roughly ten times faster per query; after a `wrangler deploy` it adds them again on the first request. Related queries are batched into one round-trip, the app database is looked up once, and validated sessions are cached for 30 seconds. Records are read while the collection's fields are checked, instead of after, which saves a round-trip per page. Set `POUCHBASE_LOG_TIMING=true` to log how long every request and database round-trip takes, and whether it went through a binding or the HTTP API.
