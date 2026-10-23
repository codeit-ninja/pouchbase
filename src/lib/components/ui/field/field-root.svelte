<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- A label, a control and a description, for controls that aren't part of a `Form`. -->
<div {...rest} class={['flex flex-col gap-1.5', className]}>
	{@render children?.()}
</div>
