---
'pouchbase': minor
---

Installing a plugin with server code deploys it to its own Worker on your Cloudflare account, with network access limited to its `permissions.network`, and registers the sign-in providers it adds. Sign-in providers are plugins: Google, GitHub, Microsoft, Discord and Twitch are built in and keep their settings, and more can be installed from the Plugins page. The Authentication page and `GET /api/auth/providers` show each provider's name and logo (`label`, `iconUrl`). Plugins whose server code imports other modules, such as `cloudflare:sockets`, are refused on install.
