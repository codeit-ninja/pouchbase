---
'pouchbase': minor
---

Add `?expand=` to the records API: `?expand=author,comments.author` returns relation and file fields as the records they point to instead of ids, up to three levels deep, filtered by the view rule of each related collection. Realtime subscriptions take `expand` too. The generated `Schema` now lists the collection each relation points to (`$relations`).
