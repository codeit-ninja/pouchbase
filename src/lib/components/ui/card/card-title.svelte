<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h2 {...rest} class={['text-lg font-semibold text-zinc-900', className]}>
	{@render children?.()}
</h2>
