<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	{...rest}
	class={[
		'flex h-header shrink-0 items-center justify-between gap-4 border-t border-zinc-200 bg-white px-4 text-sm text-zinc-600',
		className
	]}
>
	{@render children?.()}
</div>
