<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<thead {...rest} class={['border-b border-zinc-200 bg-zinc-50', className]}>
	{@render children?.()}
</thead>
