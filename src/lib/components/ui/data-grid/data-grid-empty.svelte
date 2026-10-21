<script lang="ts">
	import type { HTMLTdAttributes } from 'svelte/elements';

	type Props = HTMLTdAttributes & {
		/** Number of columns to span. */
		columns: number;
	};

	let { columns, children, class: className, ...rest }: Props = $props();
</script>

<tr>
	<td
		{...rest}
		colspan={columns}
		class={['border-b border-zinc-200 px-3 py-12 text-center text-sm text-zinc-500', className]}
	>
		{@render children?.()}
	</td>
</tr>
