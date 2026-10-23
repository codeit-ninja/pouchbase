<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import * as ScrollArea from '../scroll-area/index.js';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- A plain container: each group renders its own `Navigation.Root` landmark. -->
<ScrollArea.Root class="min-h-0 flex-1">
	<div {...rest} class={['flex flex-col gap-6 px-3 py-4', className]}>
		{@render children?.()}
	</div>
</ScrollArea.Root>
