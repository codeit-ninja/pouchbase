# @pouchbasejs/js-sdk

## 0.1.0

### Minor Changes

- [`8e5476f`](https://github.com/pouchbase/pouchbase/commit/8e5476f88d5052392fc6e104a8fc6d67ba9378c9) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pouchbase types <url>` and `fetchTypes()` to download the TypeScript types of your collections, and type the client with them: `new Pouchbase<Collections>(url)` types `pb.auth.me()` with the `users` record.

- [`8e5476f`](https://github.com/pouchbase/pouchbase/commit/8e5476f88d5052392fc6e104a8fc6d67ba9378c9) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - Add `pb.functions.invoke(name, options)` to call the serverless functions of a Pouchbase instance (`/api/functions/<name>`), with the signed-in user's token.

- [`8e5476f`](https://github.com/pouchbase/pouchbase/commit/8e5476f88d5052392fc6e104a8fc6d67ba9378c9) Thanks [@codeit-ninja](https://github.com/codeit-ninja)! - First release: password and OAuth sign-in, sign-up, password resets, email verification, `me()`, file URLs and a health check, with in-memory and `localStorage` auth stores.
