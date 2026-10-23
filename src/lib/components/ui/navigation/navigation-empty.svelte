<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p {...rest} class={['px-2 py-1 text-sm text-zinc-500', className]}>
	{@render children?.()}
</p>
