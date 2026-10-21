<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLTableRowElement> & {
		selected?: boolean;
	};

	let { selected = false, children, class: className, onclick, ...rest }: Props = $props();
</script>

<tr
	{...rest}
	{onclick}
	aria-selected={selected}
	class={[
		'transition-colors',
		onclick && 'cursor-pointer hover:bg-zinc-50',
		selected && 'bg-zinc-100 hover:bg-zinc-100',
		className
	]}
>
	{@render children?.()}
</tr>
