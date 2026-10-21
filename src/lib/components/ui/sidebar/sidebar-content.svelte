<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<nav {...rest} class={['flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4', className]}>
	{@render children?.()}
</nav>
