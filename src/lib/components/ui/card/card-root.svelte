<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...rest} class={['rounded-xl border border-zinc-200 bg-white shadow-sm', className]}>
	{@render children?.()}
</div>
