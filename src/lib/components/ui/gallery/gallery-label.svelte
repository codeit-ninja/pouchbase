<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span {...rest} class={['truncate px-1 text-sm font-medium text-zinc-900', className]}>
	{@render children?.()}
</span>
