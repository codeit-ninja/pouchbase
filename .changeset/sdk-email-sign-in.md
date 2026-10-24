---
'@pouchbasejs/js-sdk': minor
---

`pb.auth.signUp()` takes `{ name, email, password }` and returns `verificationRequired` (with `token: null`) when the instance requires a verified email, `pb.auth.signIn()` takes an email, and errors carry the API's `code`, such as `email_not_verified`.
