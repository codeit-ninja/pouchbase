---
'pouchbase': minor
---

**Breaking:** the records API returns real values: booleans as `true`/`false`, JSON fields parsed, and multiple relations, files and lists as arrays (`[]` when empty), and `/api/auth/me` returns the user in the same shape. `?fields=id,title` returns only some fields. The generated types follow, with a `<Name>Create` type per collection and a `Schema` for the SDK.
