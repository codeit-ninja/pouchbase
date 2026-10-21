<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span {...rest} aria-current="page" class={['truncate font-medium text-zinc-900', className]}>
	{@render children?.()}
</span>
