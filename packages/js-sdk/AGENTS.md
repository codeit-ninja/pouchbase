## Project Configuration

- **Project**: `@pouchbasejs/js-sdk`, the TypeScript SDK for the public API of [Pouchbase](https://github.com/pouchbase/pouchbase)
- **Language**: TypeScript (ESM only, no runtime dependencies)
- **Package Manager**: pnpm
- **Tooling**: tsdown (build to `dist/`), Vitest (`test/`), prettier, eslint, Changesets

## Language

Everything in this project is **English**: code, identifiers, comments, error messages, docs and commit messages.

## Related projects

The SDK is a workspace package in the Pouchbase repository; the app is at the repository root (`../..` from here):

| Project          | Path              | What it is                                                                      |
| ---------------- | ----------------- | ------------------------------------------------------------------------------- |
| Pouchbase        | `../..`           | The app (SvelteKit on Cloudflare Workers or Node) and the API this SDK talks to |
| pouchbase.io     | `../../site`      | Marketing site and docs; documents the SDK for end users                        |
| Pouchbase JS SDK | `.` (this folder) | Client for the public API, for browsers, Node, Deno, Bun and Workers            |

- **The app is the source of truth.** The public API lives in `../../src/routes/api/**/+server.ts` (helpers in `../../src/lib/server/api.ts`) and is documented in the _Public API_ section of `../../README.md`. Request bodies, response shapes, status codes and error messages in the SDK must match those files exactly; check them instead of guessing.
- Shared constants (such as the OAuth providers in `../../src/lib/auth/oauth-providers.ts`) are mirrored in `src/types.ts`; keep them in sync when the app changes.
- Only call endpoints under `/api/`. Everything else in the app (remote functions in `*.remote.ts`, admin pages) is internal and can change at any time.
- When the API gains an endpoint, add it to the SDK with a test, and update the docs in `../../site` when they cover the SDK, in the same change.
- The app and the site have their own `AGENTS.md` and conventions; follow those when a change touches them.

## Public API (current)

Sign-ins return `{ token, user_id }`; the token is a JWT (HS256, 7 days) sent as `Authorization: Bearer <token>`. Errors are JSON `{ message, issues? }` where `issues` maps an input field to a message. The API allows any origin (CORS `*`) and never uses cookies.

| Request                                               | SDK                                  |
| ----------------------------------------------------- | ------------------------------------ |
| `GET /api/health`                                     | `pb.health()`                        |
| `GET /api/auth/providers`                             | `pb.auth.providers()`                |
| `POST /api/auth/password/sign-up`                     | `pb.auth.signUp()`                   |
| `POST /api/auth/password/sign-in`                     | `pb.auth.signIn()`                   |
| `POST /api/auth/password/request-reset`               | `pb.auth.requestPasswordReset()`     |
| `POST /api/auth/password/confirm-reset`               | `pb.auth.confirmPasswordReset()`     |
| `POST /api/auth/verification/request`                 | `pb.auth.requestVerification()`      |
| `POST /api/auth/verification/confirm`                 | `pb.auth.confirmVerification()`      |
| `GET /api/auth/oauth2/<provider>?state=…&challenge=…` | `pb.auth.signInWithOAuth()` (popup)  |
| `POST /api/auth/oauth2/result`                        | `pb.auth.signInWithOAuth()` (polls)  |
| `GET /api/auth/me`                                    | `pb.auth.me()`                       |
| `GET /api/collections/<name>/records?page&perPage&sort&filter&fields&expand` | `pb.db.<name>.findMany()`, `findFirst()`, `count()`, `iterate()`, `findAll()` |
| `GET /api/collections/<name>/records/<id>?fields&expand` | `pb.db.<name>.find()`, `findOrThrow()` |
| `POST /api/collections/<name>/records?fields&expand`  | `pb.db.<name>.insert()`              |
| `PATCH /api/collections/<name>/records/<id>?fields&expand` | `pb.db.<name>.patch()`               |
| `DELETE /api/collections/<name>/records/<id>` (`204`) | `pb.db.<name>.remove()`              |
| `GET /api/realtime?collection=<name>` (WebSocket; protocol mirrored in `src/realtime/protocol.ts`) | `pb.realtime.subscribe()`, `pb.db.<name>.subscribe()` |
| `GET /api/files/<id>`                                 | `pb.files.url()`                     |
| `<method> /api/functions/<name>/<path>`               | `pb.functions.invoke()`              |
| `POST /api/mail/send` (API key as `Bearer pbk_…`)    | `pb.mail.send()` (needs `apiKey`)    |
| Records API with a `service` API key (`Bearer pbk_…`; API rules skipped, other keys `403`) | `pb.asService().db.<name>…` (needs `apiKey`) |
| `GET /api/collections` (service API key)              | `pb.collections.list()` (needs `apiKey`) |
| `GET /api/collections/<name>` (service API key)       | `pb.collections.find()`              |
| `POST /api/collections` (`201`)                       | `pb.collections.create()`            |
| `PATCH /api/collections/<name>?force`                 | `pb.collections.update()`            |
| `DELETE /api/collections/<name>` (`204`)              | `pb.collections.remove()`            |
| `GET /api/collections/export?collections=a,b`         | `pb.collections.export()`            |
| `POST /api/collections/import?removeMissing&force&dryRun` | `pb.collections.import()`        |
| `GET /api/types?token=…` (text, not JSON)             | `fetchTypes()`, `pouchbase types`    |

## Code style

- `if`/`else` always use braces, even for a single statement (`if (x) { return; }`, never `if (x) return;`).
- Put a blank line before and after every `if` statement (unless it is the first or last statement in its block).
- Enforced by ESLint (`curly`, `padding-line-between-statements`); run `pnpm exec eslint . --fix` to apply.
- Tabs, single quotes, no trailing commas, 100 columns (Prettier, same as the app).
- The SDK must run everywhere `fetch` exists: no Node built-ins, no DOM access outside browser-only methods (`signInWithOAuth`, `LocalAuthStore`), and no runtime dependencies.
- Public methods return promises and throw a `PouchbaseError` for non-2xx responses; "not found" for lookups is `null`, not an error. Record calls return a `Pending` (`pending()` in `src/error.ts`), so `.safe()` works on them.
- The records API is wrapped in our own terms (`pb.db`, `where` objects, `find`/`insert`/`patch`/`remove`) with types from the generated `Schema`; don't copy another SDK's method names or shapes.
- Every exported function, class and type has a JSDoc comment; the declaration files are the reference docs.

## Changesets

Versioning and the changelog are managed with [Changesets](https://changesets.dev) from the repository root (`../../.changeset/`, see its README).

- Every new feature, bug fix or breaking change gets a changeset: run `pnpm changeset` or add a Markdown file to `../../.changeset/` by hand, with frontmatter `'@pouchbasejs/js-sdk': patch | minor | major` and a one-line, user-facing description in English.
- Create the changeset in the same change as the code, as part of the work, not afterwards.
- Do **not** create a separate changeset when the change belongs to work that already has an unreleased changeset in `../../.changeset/`: update that changeset's description if it no longer covers the change.
- Bump types: `patch` for bug fixes and small improvements, `minor` for new features, `major` for breaking changes. Internal refactors, docs and tooling changes need no changeset.
- Never run `pnpm changeset:version` unless asked.

## Checks

Run `pnpm check`, `pnpm test`, `pnpm lint` and `pnpm build` before finishing a change.
