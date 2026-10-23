---
'pouchbase': minor
---

Add a **File** field type: a link to a record in `files` that the record form uploads to directly, with a preview in the grid. A File field can limit uploads to file types (images, videos, audio, PDF, documents, archives, or custom MIME types and extensions) and set a maximum file size; both are checked in the form and on the server. The `avatar` of users is now a File field that accepts images; existing installations are converted on the next start.
