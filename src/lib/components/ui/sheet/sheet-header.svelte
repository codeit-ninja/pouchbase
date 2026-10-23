<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Same height as the topbar, so the borders line up; leaves room for the close button. -->
<div
	{...rest}
	class={[
		'flex h-header shrink-0 flex-col justify-center gap-0.5 border-b border-zinc-200 pr-16 pl-6',
		className
	]}
>
	{@render children?.()}
</div>
