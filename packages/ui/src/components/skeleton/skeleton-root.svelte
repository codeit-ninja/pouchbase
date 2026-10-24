<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Placeholder block shown while content loads; size it with width/height utilities. -->
<div {...rest} aria-hidden="true" class={['animate-pulse rounded-md bg-zinc-200/70', className]}>
	{@render children?.()}
</div>
