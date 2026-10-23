<script module lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui';

	export type Variant = 'default' | 'dark';

	export type Props = ScrollAreaPrimitive.ScrollbarProps & {
		variant?: Variant;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		orientation,
		variant = 'default',
		class: className,
		...rest
	}: Props = $props();

	const thumbs = {
		default: 'bg-zinc-300 group-hover:bg-zinc-400 active:bg-zinc-500',
		dark: 'bg-zinc-700 group-hover:bg-zinc-600 active:bg-zinc-500'
	};
</script>

<!-- A slim track that widens while it is hovered or dragged, so the thumb is easy to grab. -->
<ScrollAreaPrimitive.Scrollbar
	bind:ref
	{orientation}
	class={[
		'group flex touch-none p-0.5 transition-[width,height,opacity] duration-150 select-none data-[state=hidden]:opacity-0',
		// Over the content, so showing it never shifts the layout.
		orientation === 'vertical'
			? 'absolute top-0 right-0 h-full w-2 hover:w-2.5'
			: 'absolute bottom-0 left-0 h-2 w-full flex-col hover:h-2.5',
		className
	]}
	{...rest}
>
	<ScrollAreaPrimitive.Thumb
		class={['relative flex-1 rounded-full transition-colors', thumbs[variant]]}
	/>
</ScrollAreaPrimitive.Scrollbar>
