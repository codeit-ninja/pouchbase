<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import * as ScrollArea from '../scroll-area/index.js';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLUListElement> = $props();
</script>

<!-- Scrolls inside the page, like DataGrid. -->
<ScrollArea.Root class="min-h-0 flex-1 bg-white">
	<div class="p-6">
		<ul {...rest} class={['grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4', className]}>
			{@render children?.()}
		</ul>
	</div>
</ScrollArea.Root>
