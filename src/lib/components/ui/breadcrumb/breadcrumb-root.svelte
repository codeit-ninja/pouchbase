<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<nav aria-label="Breadcrumb" {...rest} class={['min-w-0', className]}>
	<ol class="flex min-w-0 items-center gap-1.5 text-sm">
		{@render children?.()}
	</ol>
</nav>
