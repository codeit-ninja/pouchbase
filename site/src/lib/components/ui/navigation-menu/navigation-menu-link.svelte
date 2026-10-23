<script module lang="ts">
	import type { NavigationMenu } from 'bits-ui';

	/** `nav` for a top-level link next to the triggers, `item` for a row inside a dropdown. */
	export type Variant = 'nav' | 'item';

	export type Props = NavigationMenu.LinkProps & {
		variant?: Variant;
	};
</script>

<script lang="ts">
	import { NavigationMenu as Menu } from 'bits-ui';

	let { variant = 'nav', ref = $bindable(null), class: className, ...rest }: Props = $props();

	const variants = {
		nav: 'inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900',
		item: 'flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-brand-500'
	};
</script>

<Menu.Link
	bind:ref
	{...rest}
	class={[
		'transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400',
		variants[variant],
		className
	]}
/>
