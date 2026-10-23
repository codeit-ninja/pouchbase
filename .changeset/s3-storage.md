---
'pouchbase': minor
---

Add a **Storage** page under System to choose where uploaded files are stored: Cloudflare R2 (the default) or any S3-compatible bucket (Amazon S3, Backblaze B2, MinIO, …). S3 settings are checked by writing a test file before they are saved. After switching, **Move files** copies the existing files to the new storage with a progress bar; until then they are still served from the previous storage.
