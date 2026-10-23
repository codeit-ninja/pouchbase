<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<nav {...rest} class={className}>
	<ul class="flex flex-col gap-0.5">
		{@render children?.()}
	</ul>
</nav>
