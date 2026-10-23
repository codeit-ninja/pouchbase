<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { tick } from 'svelte';
	import * as Icon from '../icon';
	import { getSortableContext, getSortableItemContext } from './sortable-context';

	let {
		ref = $bindable(null),
		class: className,
		...rest
	}: HTMLButtonAttributes & { ref?: HTMLButtonElement | null } = $props();

	const ctx = getSortableContext();
	const item = getSortableItemContext();

	async function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			await ctx.move(item.index, item.index + (event.key === 'ArrowUp' ? -1 : 1));

			// Moving the item in the DOM blurs the handle; keep focus so it can be moved again.
			await tick();
			ref?.focus();
		}
	}
</script>

<!-- Give it an `aria-label`, e.g. "Move title". Drag it, or focus it and use the arrow keys. -->
<button
	bind:this={ref}
	type="button"
	title="Drag or use the arrow keys to move"
	aria-keyshortcuts="ArrowUp ArrowDown"
	{...rest}
	onpointerdown={(event) => {
		if (!rest.disabled) {
			ctx.grab(item.index, event);
		}
	}}
	onkeydown={handleKeydown}
	class={[
		'flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md border border-transparent text-zinc-300 transition-colors group-hover/item:text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50',
		ctx.dragging === item.index && 'bg-zinc-100 text-zinc-900',
		className
	]}
>
	<Icon.Root icon="lucide:grip-vertical" class="size-4" />
</button>
