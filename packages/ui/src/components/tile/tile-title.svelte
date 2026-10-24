<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h3 {...rest} class={['min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900', className]}>
	{@render children?.()}
</h3>
