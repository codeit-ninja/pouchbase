<script lang="ts">
	import type { HTMLThAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLThAttributes = $props();
</script>

<th
	scope="col"
	{...rest}
	class={['h-control px-4 text-xs font-medium tracking-wide text-zinc-500 uppercase', className]}
>
	{@render children?.()}
</th>
