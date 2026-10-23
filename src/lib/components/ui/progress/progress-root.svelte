<script module lang="ts">
	export type Props = {
		value: number;
		max: number;
		/** Spoken value, e.g. `12 of 40 files`; otherwise the number is read out. */
		'aria-valuetext'?: string;
		'aria-label'?: string;
		'aria-labelledby'?: string;
		class?: string;
		ref?: HTMLDivElement | null;
	};
</script>

<script lang="ts">
	import { Progress } from 'bits-ui';

	let { value, max, class: className, ref = $bindable(null), ...aria }: Props = $props();

	const percent = $derived(max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);
</script>

<!-- How far a task has got, e.g. moving files; for usage against a quota, use `Meter`. -->
<Progress.Root
	bind:ref
	{value}
	{max}
	{...aria}
	class={['relative h-2 w-full overflow-hidden rounded-full bg-zinc-200', className]}
>
	<div class="h-full rounded-full bg-chart-1 transition-[width]" style:width="{percent}%"></div>
</Progress.Root>
