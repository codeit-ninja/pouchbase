## Project Configuration

- **Project**: the pouchbase.io website (marketing site and docs for [Pouchbase](https://github.com/pouchbase/pouchbase)), in the `site/` folder of the Pouchbase repository; the app is at the repository root (`..`) and the SDK in `../packages/js-sdk`
- **License**: all rights reserved (see `LICENSE`), unlike the AGPL app and the MIT packages; never copy site code into the packages
- **Stack**: SvelteKit + Svelte 5 (TypeScript), Tailwind CSS 4, adapter-cloudflare (Workers)
- **Package Manager**: pnpm

## Language

Everything in this project is **English**: code, identifiers, comments, UI text, docs and commit messages.

## Code style

- `if`/`else` always use braces, even for a single statement (`if (x) { return; }`, never `if (x) return;`).
- Put a blank line before and after every `if` statement (unless it is the first or last statement in its block).
- Enforced by ESLint (`curly`, `padding-line-between-statements`); run `pnpm exec eslint . --fix` to apply.

## Components

Before writing or editing any `.svelte` file, load the **`pouchbase-site-components`** skill (`../.claude/skills/pouchbase-site-components/SKILL.md`). These are the same conventions as in the Pouchbase app. In short:

- Reuse what exists in `src/lib/components/ui/`; if nothing fits, check the Pouchbase app (`../src/lib/components/ui/`) and copy it over, otherwise **always** create a reusable component in `ui/` instead of inline markup.
- Compound structure with an `index.ts` and a namespace import: `<Button.Root>`, `<Card.Title>`, ...
- File names are lowercase kebab-case, prefixed with the component name: `card-root.svelte`, `card-title.svelte`, `card-context.ts`.
- Icons always come from Iconify through `<Icon.Root icon="lucide:plus" />` (literal names, bundled by `vite/iconify.ts`); never `@lucide/svelte` or other icon component libraries.
- Buttons that trigger async actions always show the spinner (async `onclick` does this automatically; otherwise pass `loading`).
- Forms use remote functions (`form(...)` in a `*.remote.ts`) with a Zod schema from `src/lib/schemas/`.
