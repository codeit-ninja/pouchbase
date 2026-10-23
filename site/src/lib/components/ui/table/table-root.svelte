<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLTableAttributes = $props();
</script>

<div class="not-prose overflow-x-auto rounded-xl border border-zinc-200 bg-white">
	<table {...rest} class={['w-full text-left text-sm', className]}>
		{@render children?.()}
	</table>
</div>
