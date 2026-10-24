---
'pouchbase': minor
---

App users sign in with their email instead of a username: the `username` field is removed from `users`, sign-up takes `{ name, email, password }`, and the email & password provider can require a verified email before users can sign in.
