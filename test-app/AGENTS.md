## Project Configuration

- **Project**: `pouchbase-test`, a SvelteKit app that uses Pouchbase as its backend through `@pouchbasejs/js-sdk`, to try out the app and the SDK by hand; in the `test-app/` folder of the Pouchbase repository
- **Not shipped**: private, never built or deployed by the Release workflow, no changesets
- **Stack**: SvelteKit + Svelte 5 (TypeScript), client-side only (`ssr = false`), plain CSS
- **Backend**: Pouchbase from this checkout in Docker (`docker-compose.yml`, instance `pouchbase-test`) on port 4300; keep that port free of other uses in the repository
- **Package Manager**: pnpm

## Language

Everything in this project is **English**: code, identifiers, comments, UI text, docs and commit messages.

## Related projects

| Project          | Path                 | What it is                                                                  |
| ---------------- | -------------------- | --------------------------------------------------------------------------- |
| Pouchbase        | `..`                 | The app and the public API this app talks to                                |
| Pouchbase JS SDK | `../packages/js-sdk` | The SDK, linked as `workspace:*`, so SDK changes show up live               |
| Test app         | `.` (this folder)    | One page per SDK area: health, auth, records, realtime, functions and files |

- Only talk to Pouchbase through the SDK (`pb` from `#lib/pouchbase.svelte.js`); when the SDK gains a method, add it to the page of its area.
- Keep it a test tool: no design system, no Tailwind, no icons. Each page wraps calls in a `Runner` (`#lib/run.svelte.js`) and shows the result or the `PouchbaseError` with `<Output>`.

## Code style

- `if`/`else` always use braces, even for a single statement (`if (x) { return; }`, never `if (x) return;`).
- Put a blank line before and after every `if` statement (unless it is the first or last statement in its block).
- Enforced by ESLint (`curly`, `padding-line-between-statements`); run `pnpm exec eslint . --fix` to apply.
- Tabs, single quotes, no trailing commas, 100 columns (Prettier, same as the app).

## Checks

Run `pnpm --filter pouchbase-test check` and `pnpm --filter pouchbase-test lint` before finishing a change.
