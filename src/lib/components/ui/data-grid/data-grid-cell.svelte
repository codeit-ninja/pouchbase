<script lang="ts">
	import type { HTMLTdAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLTdAttributes = $props();
</script>

<td
	{...rest}
	class={[
		'h-control max-w-80 truncate border-r border-b border-zinc-200 px-3 whitespace-nowrap text-zinc-700 last:border-r-0',
		className
	]}
>
	{@render children?.()}
</td>
