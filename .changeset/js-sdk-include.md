---
'@pouchbasejs/js-sdk': minor
---

Add `include` to record reads, `insert()`, `patch()` and `subscribe()`: `pb.db.posts.find(id, { include: { author: true } })` returns the related records instead of their ids, typed from the generated `Schema`, also nested (`{ comments: { include: { author: true } } }`).
