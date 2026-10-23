<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import * as Icon from '../icon';

	let {
		ref = $bindable(null),
		children,
		class: className,
		...rest
	}: Collapsible.TriggerProps = $props();
</script>

<!-- A text button with a chevron that turns when the content is open. -->
<Collapsible.Trigger
	bind:ref
	{...rest}
	class={[
		'group/collapsible inline-flex h-control w-fit cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 [&_svg]:size-4',
		className
	]}
>
	<Icon.Root
		icon="lucide:chevron-right"
		class="text-zinc-500 transition-transform group-data-[state=open]/collapsible:rotate-90"
	/>
	{@render children?.()}
</Collapsible.Trigger>
