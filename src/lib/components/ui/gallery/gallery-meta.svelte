<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span {...rest} class={['-mt-1.5 truncate px-1 text-xs text-zinc-500', className]}>
	{@render children?.()}
</span>
