<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<header
	{...rest}
	class={[
		'sticky top-0 z-10 flex h-header shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6',
		className
	]}
>
	{@render children?.()}
</header>
