<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- A side panel with the settings of what is selected, in sections. -->
<div {...rest} class={['flex flex-col divide-y divide-zinc-200 bg-white', className]}>
	{@render children?.()}
</div>
