# Sign in with Google

A first-party [Pouchbase](https://pouchbase.io) plugin that adds the sign-in provider `google`. It is built into Pouchbase and published to the plugin registry as `auth-google`.

- Register an OAuth app in the [Google console](https://console.cloud.google.com/apis/credentials) with the callback URL `<your Pouchbase URL>/api/auth/oauth2/google/callback`, then enter its client id and secret on the Auth page of the dashboard.
- The plugin's server code only reads the user's profile, from `openidconnect.googleapis.com` (`permissions.network`); Pouchbase handles the redirects and the token exchange.

`pnpm test` checks the profile mapping, `pnpm validate` the manifest and the server code, and `pnpm build` writes the bundle to `dist/` (build `@pouchbasejs/plugin-sdk` first). See [plugins/AGENTS.md](../AGENTS.md).

The logo comes from [`@iconify-json/logos`](https://github.com/gilbarbara/logos) (CC0-1.0).

## License

MIT
