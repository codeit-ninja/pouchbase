---
'pouchbase': patch
---

Make a first start on Workers recover when it is cut off halfway: each database migration runs as one transaction, a field whose column was left behind takes it over instead of failing with `CREATE_FIELD_FAILED`, and the log explains when the Worker is deployed under another name than its `POUCHBASE_INSTANCE` (which keeps it from adding its D1 bindings).
