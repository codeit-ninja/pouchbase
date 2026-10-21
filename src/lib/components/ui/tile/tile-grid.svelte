<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLUListElement> = $props();
</script>

<!-- Responsive grid of tiles; each Tile.Root is a list item. -->
<ul {...rest} class={['grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4', className]}>
	{@render children?.()}
</ul>
