<script lang="ts">
	import type { HTMLLiAttributes } from 'svelte/elements';
	import { getSortableContext, setSortableItemContext, type ItemVariant } from './sortable-context';

	type Props = HTMLLiAttributes & {
		/** Current position in the list. */
		index: number;
		/** `danger` marks an item that is about to be removed. */
		variant?: ItemVariant;
	};

	let { index, variant = 'default', children, class: className, ...rest }: Props = $props();

	const ctx = getSortableContext();

	setSortableItemContext({
		get index() {
			return index;
		},
		get variant() {
			return variant;
		}
	});

	const dragged = $derived(ctx.dragging === index);
	const offset = $derived(ctx.offset(index));
	// The dragged item follows the pointer directly; the others slide out of its way.
	const animated = $derived(ctx.dragging !== null && (!dragged || ctx.dropping));

	const variants = {
		default: 'border-zinc-200 bg-white hover:border-zinc-300',
		danger: 'border-red-200 bg-red-50'
	};
</script>

<!-- Children can react to hovering the item with `group-hover/item:`. -->
<li
	{...rest}
	data-sortable-index={index}
	data-dragging={dragged || undefined}
	style:transform={offset ? `translateY(${offset}px)` : undefined}
	class={[
		'group/item relative flex items-center gap-3 rounded-lg border py-2 pr-2 pl-1',
		variants[variant],
		animated
			? 'transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none'
			: 'transition-colors',
		dragged && 'z-10 shadow-lg ring-1 shadow-zinc-900/10 ring-zinc-900/5',
		className
	]}
>
	{@render children?.()}
</li>
