---
name: pouchbase-components
description: Project rules for building UI in Pouchbase. MUST be loaded before creating or editing any .svelte file, page or form in this project. Covers when to create a reusable component, the compound component structure (Form.Root, Form.Label, ...), lowercase kebab-case file naming, context sharing, styling, forms with remote functions and the English-only rule.
---

# Pouchbase component rules

These rules apply to every piece of UI in this project. Follow them together with the
`svelte-core-bestpractices` and `svelte-code-writer` skills.

## 1. Language

Everything in the project is **English**: code, identifiers, comments, UI text, validation
messages, error messages, docs and commit messages. No exceptions, even if the user talks to
you in another language.

## 2. Reuse first, otherwise create a component

1. Before writing any UI, check `src/lib/components/ui/` for an existing component.
2. If one fits, use it. Extend it with a prop or variant if needed; don't fork it.
3. If none fits, **always create a reusable component** in `src/lib/components/ui/<component>/`.
   Do not write one-off inline markup for things like buttons, inputs, cards, alerts, dialogs,
   badges, lists, etc. Pages compose components; they don't define styling of their own beyond
   layout (flex/grid/spacing).
4. Components that are specific to one route (e.g. a wizard step) live next to that route,
   but they are still built out of `ui` components.

## 3. Compound structure

Every component is a set of parts exported from an `index.ts` and used through a namespace import:

```svelte
<script lang="ts">
	import * as Form from '#lib/components/ui/form/index.js';
	import { createPost } from './data.remote';
</script>

<Form.Root form={createPost}>
	<Form.Field field={createPost.fields.title}>
		<Form.Label>Title</Form.Label>
		<Form.Input />
		<Form.Description>Shown on the overview page.</Form.Description>
		<Form.Errors />
	</Form.Field>

	<Form.Submit>Save</Form.Submit>
</Form.Root>
```

- There is always a `Root` part, even for single-element components (`<Button.Root>`).
- Part names are PascalCase in the namespace (`Form.Submit`), because that is the export name.

## 4. File naming (always lowercase)

All files are **lowercase kebab-case**, prefixed with the component name:

```
src/lib/components/ui/form/
├── index.ts
├── form-context.ts
├── form-root.svelte
├── form-field.svelte
├── form-label.svelte
├── form-input.svelte
├── form-description.svelte
├── form-errors.svelte
└── form-submit.svelte
```

`index.ts` maps them to PascalCase exports:

```ts
export { default as Root } from './form-root.svelte';
export { default as Submit } from './form-submit.svelte';
```

Route-level components follow the same rule: `account-step.svelte`, not `AccountStep.svelte`.

### Standalone vs. composite components

- Primitive controls are standalone components that work without a form: `Button` (`ui/button/`)
  and every input type. Composite components such as `Form` build on them instead of rendering
  their own `<button>` or `<input>` (e.g. `form-submit.svelte` renders `Button.Root`,
  `form-input.svelte` renders `Input.Root` and only adds the field wiring: `field.as(type)`, `id`,
  `aria-describedby`).
- All input types live together under `src/lib/components/ui/inputs/`, one folder per type, each
  with the usual structure:

  ```
  src/lib/components/ui/inputs/
  ├── input/              # text-like <input>: text, email, password, ...
  │   ├── index.ts
  │   └── input-root.svelte
  ├── textarea/           # future: textarea-root.svelte
  └── checkbox/           # future: checkbox-root.svelte
  ```

  ```svelte
  <script lang="ts">
  	import * as Input from '#lib/components/ui/inputs/input/index.js';
  </script>

  <Input.Root type="search" placeholder="Search…" bind:value={query} />
  ```

- When adding a new input type, create it under `inputs/` first, then add a matching `Form` part
  (e.g. `form-textarea.svelte`) that wraps it.

## 5. Writing a part

- Use `<script lang="ts">` and type props explicitly. Extend the matching element attributes from
  `svelte/elements` (`HTMLAttributes<HTMLDivElement>`, `HTMLInputAttributes`, ...) and spread
  `...rest` onto the element, so callers can pass any native attribute.
- Accept `class` as `class: className` and merge with the clsx-style array syntax:
  `class={['base classes', className]}`.
- Render children with `{@render children?.()}`.
- When a bits-ui primitive exists (Button, Label, Dialog, Select, ...), build on it instead of
  plain HTML, and support `ref = $bindable(null)`.
- Export shared types from a `<script module lang="ts">` block and re-export them from `index.ts`
  (see `button/button-root.svelte`: `Props`, `Variant`).
- Variants are a typed `variant` prop that maps to a class lookup object.

## 6. Sharing state between parts

Use `createContext` from `svelte` in `<component>-context.ts`:

```ts
import { createContext } from 'svelte';

export interface StepsContext {
	readonly current: number;
}

export const [getStepsContext, setStepsContext] = createContext<StepsContext>();
```

Pass reactive values through getters so children stay in sync:

```ts
setStepsContext({
	get current() {
		return current;
	}
});
```

## 7. Forms

- Forms always use **remote functions**: `form(schema, handler)` in a `*.remote.ts` file.
- Schemas are Zod and live in `src/lib/schemas/`, so pages can reuse them for
  `myForm.preflight(schema)` (schemas can't be exported from a `.remote.ts` file).
- Fields with sensitive values start with an underscore (`_password`) so they are never sent back.
- Always build forms with the `Form` component; extend it (e.g. a `form-select.svelte` or
  `form-checkbox.svelte` part) rather than writing raw inputs.
- Form-level errors use `invalid('message')` in the handler; `Form.Root` shows them.

## 8. Styling

- Tailwind v4 utility classes only, no `<style>` blocks unless something can't be expressed
  with utilities.
- Neutral palette is `zinc`; errors use `red`. Keep focus states visible (`focus-visible:`).
- **Control height:** buttons, inputs and every other form control use `h-control` (theme token
  `--spacing-control` in `src/routes/layout.css`), never a hard-coded `h-10`, so they always line
  up. Every control has a border (`border-transparent` when it shouldn't be visible) so the box
  model is identical.
- **Pointer cursor:** every clickable element shows `cursor: pointer`. The base layer in
  `layout.css` covers native elements (`button`, `a[href]`, `[role='button']`, `label[for]`,
  `select`, checkboxes, ...); custom clickable elements (e.g. a clickable card or row) must add
  `cursor-pointer` themselves. Disabled controls use `cursor-not-allowed`, never
  `pointer-events-none`.
- Every interactive element must be accessible: labels linked via `for`/`id`, `aria-invalid`,
  `aria-describedby` for errors, `aria-current` for steps.

## 9. Icons

- **Always Iconify**, never an icon component library such as `@lucide/svelte`.
- Render icons with the `Icon` component and a **literal** `prefix:name` string:

  ```svelte
  <script lang="ts">
  	import * as Icon from '#lib/components/ui/icon/index.js';
  </script>

  <Icon.Root icon="lucide:plus" />
  <Icon.Root icon="lucide:trash-2" label="Delete" />
  ```

- The Vite plugin in `vite/iconify.ts` scans `src` for these strings and bundles only the icons in
  use, so icons render during SSR and are never fetched from the Iconify API. Because of that the
  name must appear literally in the source: no `icon={`lucide:${name}`}`.
- The default set is `lucide`. To use another set, install `@iconify-json/<set>` and add it to
  `iconify({ sets: [...] })` in `vite.config.ts`.
- Icons are decorative (`aria-hidden`) unless you pass `label`.
- Custom icons are registered with `addIcon` (see `spinner/spinner-icon.ts`: `gg:spinner-alt`
  redrawn with rounded ends).

## 10. Async actions show a spinner

- Every button that triggers an async action shows the spinner while it runs.
- `Form.Submit` does this automatically while the form is submitting.
- `Button.Root` does it automatically when its `onclick` returns a promise; otherwise pass
  `loading`. While busy, the button is disabled and has `aria-busy`.
- Icon-only buttons (`size="icon"`) replace the icon with the spinner.

## 11. Checklist before you finish

- [ ] Searched `src/lib/components/ui/` first; created a component if nothing fit.
- [ ] Compound structure with `index.ts` and namespace import.
- [ ] All new files lowercase kebab-case, prefixed with the component name.
- [ ] All text and comments in English.
- [ ] Ran `svelte-autofixer` on every `.svelte` file until it reports no issues.
- [ ] `pnpm check` and `pnpm lint` pass.
