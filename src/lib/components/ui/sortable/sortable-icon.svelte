<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { getSortableItemContext } from './sortable-context';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();

	const item = getSortableItemContext();

	const variants = {
		default: 'border-zinc-200 bg-zinc-50 text-zinc-600',
		danger: 'border-red-200 bg-red-100 text-red-600'
	};
</script>

<!-- A small tile in front of the item's content, e.g. the icon of a field type. -->
<span
	{...rest}
	class={[
		'flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors [&_svg]:size-4',
		variants[item.variant],
		className
	]}
>
	{@render children?.()}
</span>
