# pouchbase.io

Source of [pouchbase.io](https://pouchbase.io), the website for [Pouchbase](https://github.com/pouchbase/pouchbase).

Built with SvelteKit and deployed to Cloudflare Workers.

## Development

Install from the repository root, then run the scripts from this folder:

```sh
pnpm install
pnpm dev
```

## Scripts

| Command        | Description                     |
| -------------- | ------------------------------- |
| `pnpm dev`     | Start the dev server            |
| `pnpm build`   | Build for production            |
| `pnpm preview` | Preview the build with Wrangler |
| `pnpm check`   | Type-check the project          |
| `pnpm lint`    | Run Prettier and ESLint         |
| `pnpm format`  | Format all files                |

## Accounts and the plugin registry

The site is also the public plugin registry (the API in `@pouchbasejs/plugin-sdk`, under `/v1`) and lets people create an account to publish plugins. Both run on a Pouchbase instance: accounts are its `users`, and the registry keeps its data in three collections. The site reaches them with a service key, so their API rules all stay **Admins only**.

| Route                                    |                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `GET /v1/plugins`, `GET /v1/plugins/:id` | Search and details, as the Plugins page of every Pouchbase uses them |
| `GET /v1/plugins/:id/versions/:version`  | A version, or `latest` (optionally for some `apiVersion`s)           |
| `GET …/versions/:version/bundle`         | The bundle, byte for byte as its integrity says; counts a download   |
| `POST /v1/plugins/:id/versions`          | Publishes a bundle with a publish token (`pbp_…`) or a user's token  |
| `/account/sign-in`, `/account/sign-up`   | Password or OAuth (GitHub) sign-in on the instance                   |
| `/account`                               | Your plugins, uploading a bundle and publish tokens for the CLI      |

The first version of a plugin makes the uploader its owner; only they can publish more. Plugins are listed right away; set `verified` on a plugin in the Pouchbase dashboard after reviewing it.

### Setting up the instance

1. Create these collections (all API rules **Admins only**):

   | Collection        | Fields                                                                                                                                                                                                                                                                                          | Unique index        |
   | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
   | `plugins`         | `slug` text, `name` text, `description` text, `owner` relation to `users`, `author` text, `license` text, `homepage` URL, `repository` URL, `readme` text, `icon_url` URL, `keywords` JSON, `version` text, `api_version` integer, `api_versions` text, `downloads` integer, `verified` boolean | `slug`              |
   | `plugin_versions` | `plugin` relation to `plugins`, `version` text, `api_version` integer, `integrity` text, `size` integer, `pouchbase` text, `permissions` JSON, `bundle` text                                                                                                                                    | `plugin`, `version` |
   | `publish_tokens`  | `user` relation to `users`, `name` text, `prefix` text, `token_hash` text, `last_used_at` date                                                                                                                                                                                                  | `token_hash`        |

2. Set up mail under **Mail**, then under **System → Authentication** turn on email & password with self sign-up and **Require a verified email** (accounts are only active once their email is verified), and GitHub.
3. Under **System → API keys**, create a key with the **service** scope.
4. Set the variables of the site Worker:

   ```sh
   pnpm exec wrangler secret put POUCHBASE_URL          # e.g. https://api.pouchbase.io
   pnpm exec wrangler secret put POUCHBASE_SERVICE_KEY  # the pbk_… key from step 3
   ```

   For `pnpm dev`, put them in `.env`.

5. The default registry of Pouchbase and the CLI is `https://api.pouchbase.io`, the host of the instance. The site Worker has a route for `api.pouchbase.io/v1/*` (`wrangler.jsonc`), which takes precedence over the instance's custom domain, so the registry API reaches the site and everything else the instance.

## License

All rights reserved; see [LICENSE](LICENSE). The rest of the Pouchbase repository is open source under its own licenses, but the website is not.
