---
'pouchbase': minor
---

Show the version of Pouchbase at the bottom of the sidebar, with an update button when GitHub has a newer release. On Cloudflare Workers the update deploys the new version to the Worker itself, keeping its databases and secrets; the single binary replaces itself and restarts; Docker and Node installations get the commands to run.
