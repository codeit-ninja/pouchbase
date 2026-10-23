---
'pouchbase': minor
---

Add a built-in `files` collection for uploads, stored in Cloudflare R2. The bucket is created through the Cloudflare API on the first upload, so no binding is needed. Files are uploaded and replaced from the record sheet, served at `/api/files/<id>` (only safe image types inline, everything else as a download), and removed from storage when their record is deleted. Relations to `files` show a preview in the records grid that is enlarged in a tooltip on hover, and the collection can be viewed as a grid of large previews. Thumbnails can be turned on under the collection's new **Settings** with sizes in PocketBase syntax (`100x100`, `300x0`, `800x600f`, ...) and are served with `?thumb=<size>`.
