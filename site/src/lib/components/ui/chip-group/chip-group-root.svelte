<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<!-- A row of links that filter a list, e.g. by category; give it an `aria-label`. -->
<nav {...rest} class={className}>
	<ul class="flex flex-wrap gap-2">
		{@render children?.()}
	</ul>
</nav>
