<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLTableRowElement> = $props();
</script>

<tr {...rest} class={className}>
	{@render children?.()}
</tr>
