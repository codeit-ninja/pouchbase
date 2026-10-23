<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...rest} aria-hidden="true" class={['mt-0.5 shrink-0 [&_svg]:size-4', className]}>
	{@render children?.()}
</div>
