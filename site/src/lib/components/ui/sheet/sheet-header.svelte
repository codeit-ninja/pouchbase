<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Same height as the top header and sidebar header. -->
<div
	{...rest}
	class={[
		'flex h-header shrink-0 flex-col justify-center border-b border-zinc-200 px-6 pr-16',
		className
	]}
>
	{@render children?.()}
</div>
