---
'pouchbase': minor
---

Replace the `avatar_url` field of the built-in `users` collection with `avatar`, a link to an image in `files`. On an OAuth sign-up the provider's profile picture is imported into `files` and linked as the user's avatar. In the record sheet, the avatar and single relations to `files` show a preview and accept a new upload, which is stored in `files` and linked on save. Existing installations get the new field and lose `avatar_url` on the next start.
