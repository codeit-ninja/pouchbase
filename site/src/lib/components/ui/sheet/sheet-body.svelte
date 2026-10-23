<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...rest} class={['flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6', className]}>
	{@render children?.()}
</div>
