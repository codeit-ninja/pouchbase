## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, sveltekit-adapter, ai-tools

## Language

Everything in this project is **English**: code, identifiers, comments, UI text, validation and error messages, docs and commit messages.

## Code style

- `if`/`else` always use braces, even for a single statement (`if (x) { return; }`, never `if (x) return;`).
- Put a blank line before and after every `if` statement (unless it is the first or last statement in its block).
- Enforced by ESLint (`curly`, `padding-line-between-statements`); run `pnpm exec eslint . --fix` to apply.

## Components

Before writing or editing any `.svelte` file, load the **`pouchbase-components`** skill (`.claude/skills/pouchbase-components/SKILL.md`). In short:

- Reuse what exists in `src/lib/components/ui/`; if nothing fits, **always** create a reusable component there instead of inline markup.
- Primitive controls are standalone (`ui/button/`, input types under `ui/inputs/<type>/`); composite components like `Form` wrap them.
- Compound structure with an `index.ts` and a namespace import: `<Form.Root>`, `<Form.Field>`, `<Form.Label>`, `<Form.Input>`, `<Form.Errors>`, `<Form.Submit>`.
- File names are lowercase kebab-case, prefixed with the component name: `form-root.svelte`, `form-description.svelte`, `form-submit.svelte`, `form-context.ts`.
- Icons always come from Iconify through `<Icon.Root icon="lucide:plus" />` (literal names, bundled by `vite/iconify.ts`); never `@lucide/svelte` or other icon component libraries.
- Buttons that trigger async actions always show the spinner (`Form.Submit` and async `onclick` do this automatically; otherwise pass `loading`).
- Forms always use remote functions (`form(...)` in a `*.remote.ts`) with a Zod schema from `src/lib/schemas/`.

## Services

Before writing server-side code (`src/lib/server`, `*.remote.ts`, hooks, `+page.server.ts`, `+server.ts`), load the **`pouchbase-services`** skill (`.claude/skills/pouchbase-services/SKILL.md`). In short:

- Business logic lives in `src/lib/server/services/<domain>.service.ts` as `class XService extends Service`, registered in `services.ts` and reached via `locals.services.x()`.
- Every public method returns a neverthrow `ResultAsync<T, ServiceError<Code, 'MESSAGE'>>`; error codes are unique per service range (1000 database, 2000 install, 3000 users, 4000 sessions, 5000 settings, 6000 collections, 7000 fields, 8000 records, 9000 indexes, 10000 OAuth providers, 11000 auth); the full table is in the skill.
- Callers check `result.isErr()` and map errors to `invalid()` / `error()` themselves; "not found" is `Ok(null)`.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
