<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLTableAttributes = $props();
</script>

<!-- Scrolls both ways; the header row stays visible (see DataGrid.Header). -->
<div class="min-h-0 flex-1 overflow-auto bg-white">
	<table
		{...rest}
		class={['w-max min-w-full border-separate border-spacing-0 text-left text-sm', className]}
	>
		{@render children?.()}
	</table>
</div>
