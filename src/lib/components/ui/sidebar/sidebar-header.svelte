<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	{...rest}
	class={['flex h-header shrink-0 items-center gap-2 border-b border-zinc-200 px-4', className]}
>
	{@render children?.()}
</div>
