<script module lang="ts">
	import type { SeriesColor } from './chart-colors';

	export type Series = {
		name: string;
		/** One value per bucket; `null` is a gap (no data), `0` is a measured zero. */
		values: (number | null)[];
		color?: SeriesColor;
	};

	export type Props = {
		series: Series[];
		/** One per bucket. The first, middle and last are printed under the plot. */
		labels: string[];
		/** `bar` stacks the series per bucket; `area` draws each series as a line with a wash. */
		type?: 'bar' | 'area';
		/** Height of the plot in pixels. */
		height?: number;
		formatValue?: (value: number) => string;
		/** What the chart shows, e.g. `Worker requests per day`. */
		'aria-label': string;
		class?: string;
	};
</script>

<script lang="ts">
	import { fills, strokes, washes } from './chart-colors';

	let {
		series,
		labels,
		type = 'bar',
		height = 160,
		formatValue = (value) => value.toLocaleString('en-US'),
		'aria-label': ariaLabel,
		class: className
	}: Props = $props();

	const count = $derived(labels.length);

	/** The height of each bucket: the stack total for bars, the tallest series for areas. */
	const totals = $derived(
		labels.map((_, i) =>
			series.reduce(
				(total, s) =>
					type === 'bar' ? total + (s.values[i] ?? 0) : Math.max(total, s.values[i] ?? 0),
				0
			)
		)
	);

	const peak = $derived(Math.max(0, ...totals));
	const empty = $derived(peak <= 0);

	/** The axis ends at a round number (1, 2 or 5 × a power of ten) at or above the peak. */
	const max = $derived.by(() => {
		if (peak <= 0) {
			return 1;
		}

		const magnitude = 10 ** Math.floor(Math.log10(peak));
		const scaled = peak / magnitude;

		return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
	});

	const axisLabels = $derived(
		count > 2 ? [labels[0], labels[Math.floor((count - 1) / 2)], labels[count - 1]] : labels
	);

	/** Stack segments of a bucket, bottom first, without the empty ones. */
	function segments(i: number) {
		const visible = series
			.map((s) => ({ color: s.color ?? 'primary', value: s.values[i] ?? 0 }))
			.filter((segment) => segment.value > 0);

		return visible.map((segment, index) => ({
			...segment,
			height: (segment.value / max) * 100,
			top: index === visible.length - 1
		}));
	}

	function x(i: number) {
		return count > 1 ? (i / (count - 1)) * 100 : 50;
	}

	function y(value: number) {
		return 100 - (value / max) * 100;
	}

	/** The line of a series; gaps are skipped, so the line connects the points around them. */
	function linePoints(s: Series) {
		return s.values
			.map((value, i) => (value === null ? null : `${x(i)},${y(value)}`))
			.filter((point) => point !== null)
			.join(' ');
	}

	function areaPoints(s: Series) {
		const indices = s.values.map((value, i) => (value === null ? -1 : i)).filter((i) => i >= 0);

		if (!indices.length) {
			return '';
		}

		return `${x(indices[0])},100 ${linePoints(s)} ${x(indices[indices.length - 1])},100`;
	}

	/** Hover text of a bucket: every series with its value. */
	function hoverText(label: string, i: number) {
		const values = series.map((s) => `${s.name} ${formatValue(s.values[i] ?? 0)}`);

		return `${label}: ${values.join(' · ')}`;
	}
</script>

<!--
	A small time-series chart without a library: bars are plain elements (so corners stay round and
	gaps stay 2px at any width), areas are an SVG stretched over the plot. Values appear on hover
	and in a visually hidden table for assistive technology.
-->
<figure class={['flex min-w-0 flex-col gap-2', className]}>
	<div class="flex gap-2">
		<!-- Value axis: the top and the middle gridline. -->
		<div
			aria-hidden="true"
			class="relative w-12 shrink-0 text-right text-xs text-zinc-500 tabular-nums"
			style:height="{height}px"
		>
			<span class="absolute top-0 right-0 -translate-y-1/2">{empty ? '' : formatValue(max)}</span>
			<span class="absolute top-1/2 right-0 -translate-y-1/2">
				{empty ? '' : formatValue(max / 2)}
			</span>
			<span class="absolute right-0 bottom-0 translate-y-1/2">0</span>
		</div>

		<div
			class="relative min-w-0 flex-1"
			style:height="{height}px"
			role="img"
			aria-label={ariaLabel}
		>
			<div aria-hidden="true" class="pointer-events-none absolute inset-0">
				<div class="absolute inset-x-0 top-0 border-t border-zinc-200"></div>
				<div class="absolute inset-x-0 top-1/2 border-t border-zinc-200"></div>
				<div class="absolute inset-x-0 bottom-0 border-t border-zinc-300"></div>
			</div>

			{#if empty}
				<p class="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
					No data in this range
				</p>
			{:else if type === 'bar'}
				<div class="absolute inset-0 flex items-stretch gap-1">
					{#each labels as label, i (i)}
						<div class="flex min-w-0 flex-1 justify-center" title={hoverText(label, i)}>
							<div class="flex h-full w-full max-w-6 flex-col-reverse gap-0.5">
								{#each segments(i) as segment, index (index)}
									<div
										class={['min-h-0 shrink', fills[segment.color], segment.top && 'rounded-t']}
										style:height="{segment.height}%"
									></div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<svg
					aria-hidden="true"
					class="absolute inset-0 h-full w-full overflow-visible"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
				>
					{#each series as s (s.name)}
						<polygon points={areaPoints(s)} class={washes[s.color ?? 'primary']} />
						<polyline
							points={linePoints(s)}
							class={['fill-none', strokes[s.color ?? 'primary']]}
							stroke-width="2"
							stroke-linejoin="round"
							stroke-linecap="round"
							vector-effect="non-scaling-stroke"
						/>
					{/each}
				</svg>
				<!-- Hover targets per bucket; the SVG itself is stretched, so it can't carry them. -->
				<div class="absolute inset-0 flex">
					{#each labels as label, i (i)}
						<div class="flex-1" title={hoverText(label, i)}></div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div aria-hidden="true" class="flex justify-between pl-14 text-xs text-zinc-500">
		{#each axisLabels as label, i (i)}
			<span>{label}</span>
		{/each}
	</div>

	<table class="sr-only">
		<caption>{ariaLabel}</caption>
		<thead>
			<tr>
				<th scope="col">Period</th>
				{#each series as s (s.name)}
					<th scope="col">{s.name}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each labels as label, i (i)}
				<tr>
					<th scope="row">{label}</th>
					{#each series as s (s.name)}
						<td>{s.values[i] === null ? '—' : formatValue(s.values[i] ?? 0)}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</figure>
