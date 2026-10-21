<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<thead {...rest} class={['sticky top-0 z-10 bg-zinc-50', className]}>
	<tr>
		{@render children?.()}
	</tr>
</thead>
