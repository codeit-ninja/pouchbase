## Project Configuration

- **Project**: the pouchbase.io website (marketing site and docs for [Pouchbase](https://github.com/pouchbase/pouchbase))
- **Stack**: SvelteKit + Svelte 5 (TypeScript), Tailwind CSS 4, adapter-cloudflare (Workers)
- **Package Manager**: pnpm

## Language

Everything in this project is **English**: code, identifiers, comments, UI text, docs and commit messages.

## Code style

- `if`/`else` always use braces, even for a single statement (`if (x) { return; }`, never `if (x) return;`).
- Put a blank line before and after every `if` statement (unless it is the first or last statement in its block).
- Enforced by ESLint (`curly`, `padding-line-between-statements`); run `pnpm exec eslint . --fix` to apply.
