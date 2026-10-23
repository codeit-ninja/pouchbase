<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- A thin row above the footer, e.g. the version of Pouchbase. -->
<div
	{...rest}
	class={[
		'flex h-row shrink-0 items-center gap-2 border-t border-zinc-200 px-3 text-xs text-zinc-500',
		className
	]}
>
	{@render children?.()}
</div>
