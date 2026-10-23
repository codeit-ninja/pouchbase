<script module lang="ts">
	export type Props = {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		id?: string;
		disabled?: boolean;
		class?: string;
		onValueChange?: (value: number) => void;
		/** Called when the user is done changing the value (pointer released, key pressed). */
		onValueCommit?: (value: number) => void;
		'aria-label'?: string;
		'aria-labelledby'?: string;
	};
</script>

<script lang="ts">
	import { Slider } from 'bits-ui';

	let {
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		id,
		disabled = false,
		class: className,
		onValueChange,
		onValueCommit,
		...aria
	}: Props = $props();
</script>

<Slider.Root
	type="single"
	bind:value
	{min}
	{max}
	{step}
	{disabled}
	{onValueChange}
	{onValueCommit}
	class={[
		'relative flex h-control w-full touch-none items-center select-none data-disabled:opacity-50',
		className
	]}
>
	<span class="relative h-1.5 w-full grow cursor-pointer overflow-hidden rounded-full bg-zinc-200">
		<Slider.Range class="absolute h-full bg-zinc-900" />
	</span>
	<Slider.Thumb
		index={0}
		{id}
		{...aria}
		class="block size-4 cursor-grab rounded-full border border-zinc-900 bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 active:cursor-grabbing"
	/>
</Slider.Root>
