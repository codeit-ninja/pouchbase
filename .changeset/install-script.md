---
'pouchbase': minor
---

Add `install.sh`, which installs Pouchbase on a Linux server in one command: it installs Docker, asks for and checks the Cloudflare credentials, and starts Pouchbase with Docker Compose, behind Caddy with HTTPS when you give it a domain name.
