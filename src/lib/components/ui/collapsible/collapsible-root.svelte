<script module lang="ts">
	import type { Collapsible as CollapsiblePrimitive } from 'bits-ui';

	export type Props = CollapsiblePrimitive.RootProps;
</script>

<script lang="ts">
	import { Collapsible } from 'bits-ui';

	let {
		open = $bindable(false),
		ref = $bindable(null),
		children,
		class: className,
		...rest
	}: Props = $props();
</script>

<Collapsible.Root bind:open bind:ref {...rest} class={['flex flex-col gap-3', className]}>
	{@render children?.()}
</Collapsible.Root>
