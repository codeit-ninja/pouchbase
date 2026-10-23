<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p {...rest} class={['max-w-sm text-sm text-zinc-500', className]}>
	{@render children?.()}
</p>
