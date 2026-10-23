<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import * as ScrollArea from '../scroll-area/index.js';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<ScrollArea.Root class="min-h-0 flex-1">
	<div {...rest} class={['flex flex-col gap-5 p-6', className]}>
		{@render children?.()}
	</div>
</ScrollArea.Root>
