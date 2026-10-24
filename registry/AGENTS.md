## Project

`pouchbase-registry` (private) runs the development instance of the plugin registry: the Node build of the Pouchbase app (`../server.mjs`, `../build`) as its own instance (`registry-dev`, port 5175), configured by `registry/.env`. It has no code of its own besides `start.mjs`; the registry API and account pages are the site (`../site`), which talks to this instance in dev through `site/.env.development.local`. See `README.md`.

- Everything in English.
- Data lives on Cloudflare (D1, R2) like every instance; never add a local database or disk storage.
- Schema changes travel to the live instance (`api.pouchbase.io`, production) with Pouchbase's own Environments (pull/publish); don't write migration scripts for the registry collections.
- Never point `registry/.env` at the live instance's name (`POUCHBASE_INSTANCE`), or it is the live installation.
- No changeset: this project isn't released.
