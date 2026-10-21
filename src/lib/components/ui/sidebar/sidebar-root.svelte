<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<aside
	{...rest}
	class={[
		'sticky top-0 flex h-svh w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50',
		className
	]}
>
	{@render children?.()}
</aside>
