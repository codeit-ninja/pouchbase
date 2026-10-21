<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...rest} class={['flex flex-col gap-1 p-6 pb-0', className]}>
	{@render children?.()}
</div>
