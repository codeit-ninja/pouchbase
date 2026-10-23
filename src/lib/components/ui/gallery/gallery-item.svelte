<script lang="ts">
	import type { HTMLLiAttributes } from 'svelte/elements';

	type Props = HTMLLiAttributes & {
		selected?: boolean;
	};

	let { selected = false, children, class: className, ...rest }: Props = $props();
</script>

<!-- Holds a Gallery.Button (the card) and optionally a Gallery.Check next to it. -->
<li
	{...rest}
	data-selected={selected || undefined}
	class={[
		'group relative rounded-xl border bg-white p-2 transition-colors',
		selected ? 'border-zinc-900 ring-2 ring-zinc-900/10' : 'border-zinc-200 hover:border-zinc-300',
		className
	]}
>
	{@render children?.()}
</li>
