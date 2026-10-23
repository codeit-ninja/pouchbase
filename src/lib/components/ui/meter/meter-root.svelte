<script module lang="ts">
	export type Status = 'ok' | 'warning' | 'exceeded';

	export type Props = {
		value: number;
		max: number;
		/** Colours the fill; `warning` from 80% of the quota, `exceeded` from 100%. */
		status?: Status;
		/** Spoken value, e.g. `12,300 of 100,000 requests`; otherwise the number is read out. */
		'aria-valuetext'?: string;
		'aria-label'?: string;
		'aria-labelledby'?: string;
		class?: string;
		ref?: HTMLDivElement | null;
	};
</script>

<script lang="ts">
	import { Meter } from 'bits-ui';

	let {
		value,
		max,
		status = 'ok',
		class: className,
		ref = $bindable(null),
		...aria
	}: Props = $props();

	const fills: Record<Status, string> = {
		ok: 'bg-chart-1',
		warning: 'bg-amber-500',
		exceeded: 'bg-red-600'
	};

	const tracks: Record<Status, string> = {
		ok: 'bg-chart-1/15',
		warning: 'bg-amber-500/15',
		exceeded: 'bg-red-600/15'
	};

	const percent = $derived(max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);
</script>

<!-- Usage against a quota: the fill carries the severity, the track is a lighter step of the same hue. -->
<Meter.Root
	bind:ref
	{value}
	{max}
	min={0}
	{...aria}
	class={['relative h-1.5 w-full overflow-hidden rounded-full', tracks[status], className]}
>
	<div
		class={['h-full rounded-full transition-[width]', fills[status]]}
		style:width="{percent}%"
	></div>
</Meter.Root>
