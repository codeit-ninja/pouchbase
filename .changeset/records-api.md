---
'pouchbase': minor
---

Add a **records API** (`/api/collections/<name>/records`) to list, filter, sort, view, create, update and delete records, guarded by PocketBase-style **API rules** per collection. The new **API** panel of a collection sets who may use each action (admins only by default, everyone, signed-in users, the owner, or a custom filter such as `author = @request.auth.id`, written with autocomplete and live error checking), and previews every endpoint with its parameters, example responses and JavaScript SDK and cURL examples.
