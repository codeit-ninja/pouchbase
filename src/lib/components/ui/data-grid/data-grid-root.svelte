<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';
	import * as ScrollArea from '../scroll-area/index.js';

	type Props = HTMLTableAttributes & {
		/** Dims the grid while new rows load, e.g. when paging or sorting. */
		busy?: boolean;
	};

	let { busy = false, children, class: className, ...rest }: Props = $props();
</script>

<!-- Scrolls both ways; the header row stays visible (see DataGrid.Header). -->
<ScrollArea.Root
	orientation="both"
	class={['min-h-0 flex-1 bg-white transition-opacity', busy && 'opacity-60']}
	aria-busy={busy || undefined}
>
	<table
		{...rest}
		class={['w-max min-w-full border-separate border-spacing-0 text-left text-sm', className]}
	>
		{@render children?.()}
	</table>
</ScrollArea.Root>
