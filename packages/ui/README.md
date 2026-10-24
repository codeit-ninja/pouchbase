# @pouchbasejs/ui

The Svelte 5 UI components of the [Pouchbase](https://pouchbase.io) dashboard: buttons, inputs, cards, tables, tooltips and the other primitives the dashboard is built with. Plugins can use them so their pages and fields look like the rest of the dashboard.

Built on [Svelte 5](https://svelte.dev), [bits-ui](https://bits-ui.com), [Iconify](https://iconify.design) and [Tailwind CSS 4](https://tailwindcss.com).

## Install

```bash
pnpm add @pouchbasejs/ui svelte bits-ui @iconify/svelte
pnpm add -D tailwindcss @tailwindcss/vite @iconify-json/lucide
```

## Setup

Import the theme after Tailwind in your global stylesheet. It holds the design tokens (`h-control`, `h-row`, chart colors, animations) and the base styles the components rely on, and tells Tailwind to generate the classes the components use:

```css
@import 'tailwindcss';
@import '@pouchbasejs/ui/theme.css';
```

Add the Iconify Vite plugin. It bundles only the icons that are used, in your sources (`src` by default) and in these components, so icons render on the server and are never fetched from the Iconify API:

```ts
// vite.config.ts
import { icons as lucide } from '@iconify-json/lucide';
import { iconify } from '@pouchbasejs/ui/vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [iconify({ sets: [lucide], srcDirs: ['src'] }), tailwindcss(), sveltekit()]
});
```

Then register the icons once, in your root layout (or your app's entry point):

```svelte
<script lang="ts">
	import 'virtual:iconify';
</script>
```

For TypeScript, declare the virtual module (e.g. in `src/virtual.d.ts`):

```ts
declare module 'virtual:iconify' {}
```

## Usage

Every component is a set of parts used through a namespace, with a `Root` part. Import a component from its own entry point, or all of them from the package root:

```svelte
<script lang="ts">
	import * as Button from '@pouchbasejs/ui/button';
	import * as Icon from '@pouchbasejs/ui/icon';
	import { Card } from '@pouchbasejs/ui';
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Backups</Card.Title>
	</Card.Header>
	<Card.Content>
		<Button.Root onclick={() => fetch('/backup', { method: 'POST' })}>
			<Icon.Root icon="lucide:plus" />
			New backup
		</Button.Root>
	</Card.Content>
</Card.Root>
```

Icon names must appear literally in the source (`icon="lucide:plus"`, not ``icon={`lucide:${name}`}``) so the Vite plugin can find them. A button whose `onclick` returns a promise shows a spinner until it settles.

| Entry point                       | Parts                                                                       |
| --------------------------------- | --------------------------------------------------------------------------- |
| `@pouchbasejs/ui/badge`           | `Root`                                                                      |
| `@pouchbasejs/ui/button`          | `Root`                                                                      |
| `@pouchbasejs/ui/callout`         | `Root`, `Icon`, `Body`, `Title`, `Description`                              |
| `@pouchbasejs/ui/card`            | `Root`, `Header`, `Title`, `Description`, `Content`                         |
| `@pouchbasejs/ui/empty`           | `Root`, `Icon`, `Title`, `Description`                                      |
| `@pouchbasejs/ui/icon`            | `Root`                                                                      |
| `@pouchbasejs/ui/link`            | `Root`                                                                      |
| `@pouchbasejs/ui/meter`           | `Root`                                                                      |
| `@pouchbasejs/ui/progress`        | `Root`                                                                      |
| `@pouchbasejs/ui/scroll-area`     | `Root`, `Scrollbar`                                                         |
| `@pouchbasejs/ui/segmented`       | `Root`, `Item`                                                              |
| `@pouchbasejs/ui/skeleton`        | `Root`                                                                      |
| `@pouchbasejs/ui/spinner`         | `Root`                                                                      |
| `@pouchbasejs/ui/swatch`          | `Root`                                                                      |
| `@pouchbasejs/ui/table`           | `Root`, `Header`, `Body`, `Row`, `Head`, `Cell`                             |
| `@pouchbasejs/ui/thumbnail`       | `Root`                                                                      |
| `@pouchbasejs/ui/tile`            | `Root`, `Grid`, `Header`, `Icon`, `Title`, `Value`, `Description`, `Footer` |
| `@pouchbasejs/ui/tooltip`         | `Root`, `Trigger`, `Content`                                                |
| `@pouchbasejs/ui/inputs/checkbox` | `Root`                                                                      |
| `@pouchbasejs/ui/inputs/input`    | `Root`                                                                      |
| `@pouchbasejs/ui/inputs/select`   | `Root`                                                                      |
| `@pouchbasejs/ui/inputs/slider`   | `Root`                                                                      |
| `@pouchbasejs/ui/inputs/textarea` | `Root`                                                                      |

Every part accepts `class` and the native attributes of its element.

## Versioning

The component names and props are part of the Pouchbase plugin API: within a major version they only change in a backwards compatible way (new components, parts, props or variants).

## License

MIT
