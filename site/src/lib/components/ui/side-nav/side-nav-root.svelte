<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<!-- A vertical list of links, such as the docs sidebar or an "On this page" outline. -->
<nav {...rest} class={['flex flex-col gap-6', className]}>
	{@render children?.()}
</nav>
