# @pouchbasejs/js-sdk

## 0.5.0

### Minor Changes

- [`346ed1a`](https://github.com/pouchbase/pouchbase/commit/346ed1afcc5171bfa03b2f31e5b025244bd347e5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - `pb.auth.signUp()` takes `{ name, email, password }` and returns `verificationRequired` (with `token: null`) when the instance requires a verified email, `pb.auth.signIn()` takes an email, and errors carry the API's `code`, such as `email_not_verified`.

## 0.4.0

### Minor Changes

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pb.collections` to manage collections, their fields, indexes and API rules with a service API key, and to export and import them.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `include` to record reads, `insert()`, `patch()` and `subscribe()`: `pb.db.posts.find(id, { include: { author: true } })` returns the related records instead of their ids, typed from the generated `Schema`, also nested (`{ comments: { include: { author: true } } }`).

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pb.mail.send()` to send email templates, an `apiKey` option for server-side code such as functions (`env.POUCHBASE_API_KEY`), and `pb.asService()` to use the records API with a service key.

- [`103e69c`](https://github.com/pouchbase/pouchbase/commit/103e69c026a081c67b4697763fe51b7c6c3c8b1d) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add realtime: `pb.db.<name>.subscribe()` and `pb.realtime.subscribe()` call you with every change to records you may see, with `where`, `select` and `id`, over one WebSocket per collection that reconnects by itself and follows sign-ins.

## 0.3.0

### Minor Changes

- [`58ab82d`](https://github.com/pouchbase/pouchbase/commit/58ab82d2ec81c175c5b60d7f4754f32b8c0cde80) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - **Breaking:** `pb.collection()` and `pb.filter()` are replaced by `pb.db`, typed from the generated `Schema`: `pb.db.posts.findMany({ where, orderBy, select, limit })`, `find()`, `findFirst()`, `count()`, `iterate()`, `findAll()`, `insert()`, `patch()` and `remove()`. Conditions are objects (`{ views: { gte: 10 } }`) so values never need escaping, `select` narrows the result type, and inputs are checked against the `<Name>Create` types. Also new: `createClient<Schema>()`, the `filter` tagged template for hand-written filters, `.safe()` to get a result instead of an exception, and `kind` on `PouchbaseError` with `isPouchbaseError()`.

## 0.2.0

### Minor Changes

- [`bd0104a`](https://github.com/pouchbase/pouchbase/commit/bd0104afe288707cde47b6289b7a0f6723d3fab5) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pb.collection(name)` with `getList()`, `getFullList()`, `getFirstListItem()`, `getOne()`, `create()`, `update()` and `delete()` for the new records API, typed with the generated `Collections`, and `pb.filter()` to build filters with escaped values.

## 0.1.0

### Minor Changes

- [`8e5476f`](https://github.com/pouchbase/pouchbase/commit/8e5476f88d5052392fc6e104a8fc6d67ba9378c9) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pouchbase types <url>` and `fetchTypes()` to download the TypeScript types of your collections, and type the client with them: `new Pouchbase<Collections>(url)` types `pb.auth.me()` with the `users` record.

- [`8e5476f`](https://github.com/pouchbase/pouchbase/commit/8e5476f88d5052392fc6e104a8fc6d67ba9378c9) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pb.functions.invoke(name, options)` to call the serverless functions of a Pouchbase instance (`/api/functions/<name>`), with the signed-in user's token.

- [`8e5476f`](https://github.com/pouchbase/pouchbase/commit/8e5476f88d5052392fc6e104a8fc6d67ba9378c9) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - First release: password and OAuth sign-in, sign-up, password resets, email verification, `me()`, file URLs and a health check, with in-memory and `localStorage` auth stores.
