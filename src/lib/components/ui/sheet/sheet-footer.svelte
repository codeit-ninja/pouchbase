<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Stays in view below the scrolling body; the muted surface sets the actions apart. -->
<div
	{...rest}
	class={[
		'flex h-header shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-6',
		className
	]}
>
	{@render children?.()}
</div>
