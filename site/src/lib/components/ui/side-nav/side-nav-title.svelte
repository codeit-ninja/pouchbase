<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p {...rest} class={['px-3 pb-1 text-xs font-medium text-zinc-500', className]}>
	{@render children?.()}
</p>
