# Sign in with Twitch

A first-party [Pouchbase](https://pouchbase.io) plugin that adds the sign-in provider `twitch`. It is built into Pouchbase and published to the plugin registry as `auth-twitch`.

- Register an OAuth app in the [Twitch console](https://dev.twitch.tv/console/apps) with the callback URL `<your Pouchbase URL>/api/auth/oauth2/twitch/callback`, then enter its client id and secret on the Auth page of the dashboard.
- The plugin's server code only reads the user's profile, from `api.twitch.tv` (`permissions.network`); Pouchbase handles the redirects and the token exchange.

`pnpm test` checks the profile mapping, `pnpm validate` the manifest and the server code, and `pnpm build` writes the bundle to `dist/` (build `@pouchbasejs/plugin-sdk` first). See [plugins/AGENTS.md](../AGENTS.md).

The logo comes from [`@iconify-json/logos`](https://github.com/gilbarbara/logos) (CC0-1.0).

## License

MIT
