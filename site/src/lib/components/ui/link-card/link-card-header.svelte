<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Puts the title and any badges on one row. -->
<div {...rest} class={['flex flex-wrap items-center gap-x-3 gap-y-1', className]}>
	{@render children?.()}
</div>
