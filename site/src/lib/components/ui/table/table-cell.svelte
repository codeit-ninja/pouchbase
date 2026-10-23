<script lang="ts">
	import type { HTMLTdAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLTdAttributes = $props();
</script>

<td {...rest} class={['px-4 py-2 align-middle text-zinc-700', className]}>
	{@render children?.()}
</td>
