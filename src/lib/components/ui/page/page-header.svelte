<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<header {...rest} class={['flex flex-wrap items-center justify-between gap-4', className]}>
	{@render children?.()}
</header>
