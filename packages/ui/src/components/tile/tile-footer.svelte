<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Pushed to the bottom, so buttons line up across tiles of different heights. -->
<div {...rest} class={['mt-auto flex items-center gap-2', className]}>
	{@render children?.()}
</div>
