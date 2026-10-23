<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';
	import * as ScrollArea from '../scroll-area/index.js';

	let { children, class: className, ...rest }: HTMLTableAttributes = $props();
</script>

<ScrollArea.Root
	orientation="horizontal"
	class="not-prose rounded-xl border border-zinc-200 bg-white"
>
	<table {...rest} class={['w-full text-left text-sm', className]}>
		{@render children?.()}
	</table>
</ScrollArea.Root>
