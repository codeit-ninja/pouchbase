---
'@pouchbasejs/js-sdk': minor
---

**Breaking:** `pb.collection()` and `pb.filter()` are replaced by `pb.db`, typed from the generated `Schema`: `pb.db.posts.findMany({ where, orderBy, select, limit })`, `find()`, `findFirst()`, `count()`, `iterate()`, `findAll()`, `insert()`, `patch()` and `remove()`. Conditions are objects (`{ views: { gte: 10 } }`) so values never need escaping, `select` narrows the result type, and inputs are checked against the `<Name>Create` types. Also new: `createClient<Schema>()`, the `filter` tagged template for hand-written filters, `.safe()` to get a result instead of an exception, and `kind` on `PouchbaseError` with `isPouchbaseError()`.
