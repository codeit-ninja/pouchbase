<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h3 {...rest} class={['text-sm font-semibold text-zinc-900', className]}>
	{@render children?.()}
</h3>
