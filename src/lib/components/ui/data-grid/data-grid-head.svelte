<script lang="ts">
	import type { HTMLThAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLThAttributes = $props();
</script>

<th
	scope="col"
	{...rest}
	class={[
		'h-row border-r border-b border-zinc-200 px-3 text-xs font-medium whitespace-nowrap text-zinc-600 last:border-r-0',
		className
	]}
>
	{@render children?.()}
</th>
