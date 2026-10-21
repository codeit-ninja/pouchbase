<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h1 {...rest} class={['text-2xl font-semibold text-zinc-900', className]}>
	{@render children?.()}
</h1>
