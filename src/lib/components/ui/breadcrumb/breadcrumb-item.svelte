<script lang="ts">
	import type { HTMLLiAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLLiAttributes = $props();
</script>

<li {...rest} class={['inline-flex min-w-0 items-center gap-1.5', className]}>
	{@render children?.()}
</li>
