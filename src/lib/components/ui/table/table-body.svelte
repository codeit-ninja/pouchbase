<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<tbody {...rest} class={['divide-y divide-zinc-200', className]}>
	{@render children?.()}
</tbody>
