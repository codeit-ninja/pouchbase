<script lang="ts">
	import { DropdownMenu } from 'bits-ui';

	type Props = DropdownMenu.ItemProps & {
		/** `danger` for destructive actions such as deleting. */
		variant?: 'default' | 'danger';
	};

	let { variant = 'default', ref = $bindable(null), class: className, ...rest }: Props = $props();

	const variants = {
		default: 'text-zinc-700 data-highlighted:bg-zinc-100 data-highlighted:text-zinc-900',
		danger:
			'text-red-600 data-highlighted:bg-red-50 data-highlighted:text-red-700 [&_svg]:text-red-500'
	};
</script>

<DropdownMenu.Item
	bind:ref
	{...rest}
	class={[
		'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-zinc-500',
		variants[variant],
		className
	]}
/>
