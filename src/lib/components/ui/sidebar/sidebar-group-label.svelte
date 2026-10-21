<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h2 {...rest} class={['px-2 text-xs font-medium tracking-wide text-zinc-500 uppercase', className]}>
	{@render children?.()}
</h2>
