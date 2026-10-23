---
'pouchbase': minor
---

Add realtime: apps follow the creates, updates and deletes of a collection's records, or of one record, over a WebSocket at `/api/realtime`, filtered by the collection's view rule and an optional filter. On Workers each collection's connections live in a Durable Object (`RealtimeHub`); on Node the server holds them. The dashboard's records grid updates live too.
