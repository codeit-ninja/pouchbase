<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<!-- The one number a tile is about, e.g. a size or a count. -->
<p {...rest} class={['text-2xl font-semibold text-zinc-900', className]}>
	{@render children?.()}
</p>
