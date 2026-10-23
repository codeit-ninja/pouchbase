<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import * as ScrollArea from '../scroll-area/index.js';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<main {...rest} class="flex min-h-0 min-w-0 flex-1 flex-col">
	<ScrollArea.Root class="min-h-0 flex-1">
		<div class={['flex flex-col gap-6 px-8 py-8', className]}>
			{@render children?.()}
		</div>
	</ScrollArea.Root>
</main>
