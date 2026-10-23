<script lang="ts">
	import { NavigationMenu } from 'bits-ui';
	import * as Icon from '../icon';

	let {
		ref = $bindable(null),
		children,
		class: className,
		...rest
	}: NavigationMenu.TriggerProps = $props();
</script>

<NavigationMenu.Trigger
	bind:ref
	{...rest}
	class={[
		'group inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-zinc-700 transition-colors outline-none select-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 data-[state=open]:bg-zinc-100 data-[state=open]:text-zinc-900',
		className
	]}
>
	{@render children?.()}

	<Icon.Root
		icon="lucide:chevron-down"
		class="size-4 text-zinc-500 transition-transform duration-200 group-data-[state=open]:rotate-180"
	/>
</NavigationMenu.Trigger>
