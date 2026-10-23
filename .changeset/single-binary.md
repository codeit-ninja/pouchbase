---
'pouchbase': minor
---

Run Pouchbase as a single binary, like PocketBase: every release attaches executables for Linux (x64, arm64), macOS (Apple silicon) and Windows that contain Node 26, the app and its static files. Start one with `pouchbase serve --http=0.0.0.0:8090 --origin=https://...`; it reads the Cloudflare credentials from the environment or a `.env` file, and the data stays on Cloudflare D1 and R2.
