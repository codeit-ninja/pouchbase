## Project Configuration

- **Project**: `@pouchbasejs/ui`, the Svelte 5 UI primitives of the Pouchbase dashboard, for the app and for plugins (MIT)
- **Language**: TypeScript, Svelte 5 (runes)
- **Package Manager**: pnpm
- **Tooling**: `@sveltejs/package` (build to `dist/`), svelte-check, prettier and eslint from the repository root, Changesets

## Language

Everything in this project is **English**: code, identifiers, comments, docs and commit messages.

## Layout

```
src/
├── index.ts            # every component as a namespace (`export * as Button from ...`)
├── theme.css           # @theme tokens, base layer, `@source './components'`
├── vite/iconify.ts     # `iconify({ sets, srcDirs? })` Vite plugin, exposes `virtual:iconify`
└── components/
    ├── badge/ button/ callout/ card/ empty/ icon/ link/ meter/ progress/ scroll-area/
    ├── segmented/ skeleton/ spinner/ swatch/ table/ thumbnail/ tile/ tooltip/
    └── inputs/{checkbox,input,select,slider,textarea}/
```

- Exports point at the sources (`./<name>` → `./src/components/<name>/index.ts`); `publishConfig.exports` swaps them for `dist/` when the package is packed. The app at the repository root uses the sources through `workspace:*`.
- The app keeps a shim per moved component (`src/lib/components/ui/<name>/index.ts` = `export * from '@pouchbasejs/ui/<name>';`), so `#lib/components/ui/<name>/index.js` keeps working.

## Rules

- Follow the component rules of the app (`.claude/skills/pouchbase-components/SKILL.md` at the repository root): compound parts with a `Root`, lowercase kebab-case file names prefixed with the component name, `class` merged with the array syntax, `...rest` on the element, Tailwind utilities only.
- **Only primitives belong here.** A component may import `svelte`, `svelte/*`, `bits-ui`, `@iconify/svelte` and other components of this package, nothing else: no `$app`, `$lib`, `#lib`, `virtual:` modules or app code. Components that need the app (forms with remote functions, navigation, editors, toasts, dialogs, ...) stay in `src/lib/components/ui/` of the app.
- Relative imports are explicit (`'../icon/index.js'`, `'./spinner-icon.js'`), so the published `dist/` resolves without a bundler's directory lookup.
- `Icon.Root` doesn't register icons: the host imports `virtual:iconify` once (the app does in `src/routes/+layout.svelte`). Icon names must be literal strings; the Vite plugin always scans `src/components` (or `dist/components`) of this package as well as the host's `srcDirs`.
- Design tokens (`--spacing-control`, `--spacing-row`, chart colors, animations) live in `src/theme.css`; the host imports it after `tailwindcss`.
- Component names, parts and props are part of the Pouchbase plugin API (version 1): changes are additive only (new components, parts, props or variants). Renaming or removing one is a breaking change of the plugin API.
- Every user-facing change gets a changeset for `@pouchbasejs/ui` (see `../../.changeset/README.md`).

## Checks

Run from the repository root:

- `pnpm --filter @pouchbasejs/ui check` (svelte-check)
- `pnpm --filter @pouchbasejs/ui build` (svelte-package to `dist/`)
- `pnpm lint` (prettier and eslint cover this package)
- Run the Svelte MCP `svelte-autofixer` on every `.svelte` file you change.
