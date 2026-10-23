<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- A horizontal rule, with a short label such as "or" in the middle when it has children. -->
<div
	role="separator"
	{...rest}
	class={['flex items-center gap-3 text-xs text-zinc-500', className]}
>
	<span class="h-px flex-1 bg-zinc-200"></span>
	{#if children}
		{@render children()}
		<span class="h-px flex-1 bg-zinc-200"></span>
	{/if}
</div>
