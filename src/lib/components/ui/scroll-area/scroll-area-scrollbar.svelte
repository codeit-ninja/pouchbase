<script module lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui';

	export type Props = ScrollAreaPrimitive.ScrollbarProps;
</script>

<script lang="ts">
	let { ref = $bindable(null), orientation, class: className, ...rest }: Props = $props();
</script>

<!-- A slim track that widens while it is hovered or dragged, so the thumb is easy to grab. -->
<ScrollAreaPrimitive.Scrollbar
	bind:ref
	{orientation}
	class={[
		'group flex touch-none p-0.5 transition-[width,height,opacity] duration-150 select-none data-[state=hidden]:opacity-0',
		orientation === 'vertical' ? 'h-full w-2 hover:w-2.5' : 'h-2 flex-col hover:h-2.5',
		className
	]}
	{...rest}
>
	<ScrollAreaPrimitive.Thumb
		class="relative flex-1 rounded-full bg-zinc-300 transition-colors group-hover:bg-zinc-400 active:bg-zinc-500"
	/>
</ScrollAreaPrimitive.Scrollbar>
