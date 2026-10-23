<script module lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui';
	import type { Variant } from './scroll-area-scrollbar.svelte';

	export type Props = ScrollAreaPrimitive.RootProps & {
		/** Classes for the scrolling element, e.g. a `max-h-*` that limits its height. */
		viewportClass?: string;
		/** Which scrollbars to show. */
		orientation?: 'vertical' | 'horizontal' | 'both';
		/** `dark` for a dark background, such as a code block. */
		variant?: Variant;
	};
</script>

<script lang="ts">
	import ScrollAreaScrollbar from './scroll-area-scrollbar.svelte';

	let {
		ref = $bindable(null),
		viewportClass,
		orientation = 'vertical',
		variant = 'default',
		type = 'hover',
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<ScrollAreaPrimitive.Root
	bind:ref
	{type}
	class={['relative flex flex-col overflow-hidden', className]}
	{...rest}
>
	<ScrollAreaPrimitive.Viewport class={['min-h-0 w-full flex-1 rounded-[inherit]', viewportClass]}>
		{@render children?.()}
	</ScrollAreaPrimitive.Viewport>

	{#if orientation !== 'horizontal'}
		<ScrollAreaScrollbar orientation="vertical" {variant} />
	{/if}

	{#if orientation !== 'vertical'}
		<ScrollAreaScrollbar orientation="horizontal" {variant} />
	{/if}

	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
