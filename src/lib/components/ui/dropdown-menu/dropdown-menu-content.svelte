<script lang="ts">
	import { DropdownMenu } from 'bits-ui';

	let {
		ref = $bindable(null),
		sideOffset = 4,
		align = 'end',
		class: className,
		...rest
	}: DropdownMenu.ContentProps = $props();
</script>

<DropdownMenu.Portal>
	<DropdownMenu.Content
		bind:ref
		{sideOffset}
		{align}
		{...rest}
		class={[
			'z-50 flex min-w-44 flex-col gap-0.5 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg outline-none',
			className
		]}
	/>
</DropdownMenu.Portal>
