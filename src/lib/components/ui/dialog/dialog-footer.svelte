<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...rest} class={['flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className]}>
	{@render children?.()}
</div>
