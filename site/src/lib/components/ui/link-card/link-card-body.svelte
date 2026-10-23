<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Groups the title and description, e.g. next to the icon in a horizontal card. -->
<div {...rest} class={['flex min-w-0 flex-1 flex-col gap-1', className]}>
	{@render children?.()}
</div>
