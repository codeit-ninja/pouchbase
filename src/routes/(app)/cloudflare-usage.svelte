<script lang="ts">
	import type { UsageRange } from '#lib/cloudflare/limits.js';
	import type { D1DatabaseUsage, UsageSeries } from '#lib/cloudflare/types.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import {
		formatBucket,
		formatBytes,
		formatCount,
		formatDuration
	} from '#lib/cloudflare/format.js';
	import { getCloudflareUsage } from './cloudflare.remote';
	import CloudflareSectionNotice from './cloudflare-section-notice.svelte';

	type Props = {
		range: UsageRange;
	};

	let { range }: Props = $props();

	const result = $derived(await getCloudflareUsage(range));

	/** The previous charts stay on screen while another range loads. */
	const loading = $derived($effect.pending() > 0);

	const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

	/**
	 * D1 usage as three series: this installation's two databases and the rest of the account
	 * folded into one, because the limits count every database.
	 */
	function d1Series(
		databases: D1DatabaseUsage[],
		metric: 'rowsRead' | 'rowsWritten',
		length: number
	): Chart.Series[] {
		const own = databases.filter((database) => database.name);
		const others = databases.filter((database) => !database.name);
		const colors: Chart.SeriesColor[] = ['primary', 'secondary'];

		const series: Chart.Series[] = own.map((database, i) => ({
			name: database.name ?? database.databaseId,
			values: database[metric],
			color: colors[i] ?? 'tertiary'
		}));

		if (others.length) {
			const values = Array.from({ length }, (_, i) =>
				others.reduce((total, database) => total + database[metric][i], 0)
			);

			series.push({ name: 'Other databases', values, color: 'neutral' });
		}

		return series;
	}

	function charts(data: UsageSeries) {
		const labels = data.buckets.map((bucket) => formatBucket(bucket, data.granularity));
		const unit = data.granularity === 'hour' ? 'hour' : 'day';
		const cpu = data.workers.cpuMsP50.filter((value): value is number => value !== null);
		const medianCpu = cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : null;
		const latestStorage = data.r2.storageBytes.at(-1) ?? 0;
		const latestObjects = data.r2.objectCount.at(-1) ?? 0;

		return {
			labels,
			unit,
			requests: {
				series: [
					{ name: 'Requests', values: data.workers.requests, color: 'primary' },
					{ name: 'Errors', values: data.workers.errors, color: 'danger' }
				] satisfies Chart.Series[],
				summary: `${formatCount(sum(data.workers.requests))} requests · ${formatCount(sum(data.workers.errors))} errors${medianCpu === null ? '' : ` · median CPU ${formatDuration(medianCpu)}`}`
			},
			rowsRead: {
				series: d1Series(data.d1.byDatabase, 'rowsRead', labels.length),
				summary: `${formatCount(sum(data.d1.totals.rowsRead))} rows read across the account`
			},
			rowsWritten: {
				series: d1Series(data.d1.byDatabase, 'rowsWritten', labels.length),
				summary: `${formatCount(sum(data.d1.totals.rowsWritten))} rows written across the account`
			},
			storage: {
				series: [
					{ name: 'Stored', values: data.r2.storageBytes, color: 'primary' }
				] satisfies Chart.Series[],
				summary: `${formatBytes(latestStorage)} in ${formatCount(latestObjects)} ${latestObjects === 1 ? 'object' : 'objects'}`
			},
			operations: {
				series: [
					{ name: 'Class A (writes, lists)', values: data.r2.classA, color: 'primary' },
					{ name: 'Class B (reads)', values: data.r2.classB, color: 'secondary' }
				] satisfies Chart.Series[],
				summary: `${formatCount(sum(data.r2.classA))} Class A · ${formatCount(sum(data.r2.classB))} Class B`
			}
		};
	}
</script>

{#if !result.ok}
	<CloudflareSectionNotice {result} />
{:else}
	{@const view = charts(result.data)}

	<div
		class={['grid gap-4 transition-opacity md:grid-cols-2', loading && 'opacity-60']}
		aria-busy={loading}
	>
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Worker requests</Card.Title>
				<Card.Description>{view.requests.summary}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Chart.Root
					series={view.requests.series}
					labels={view.labels}
					formatValue={formatCount}
					aria-label="Worker requests and errors per {view.unit}"
				/>
				<Chart.Legend series={view.requests.series} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">R2 operations</Card.Title>
				<Card.Description>{view.operations.summary}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Chart.Root
					series={view.operations.series}
					labels={view.labels}
					formatValue={formatCount}
					aria-label="R2 operations per {view.unit} by billing class"
				/>
				<Chart.Legend series={view.operations.series} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">D1 rows read</Card.Title>
				<Card.Description>{view.rowsRead.summary}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Chart.Root
					series={view.rowsRead.series}
					labels={view.labels}
					formatValue={formatCount}
					aria-label="D1 rows read per {view.unit} by database"
				/>
				{#if view.rowsRead.series.length > 1}
					<Chart.Legend series={view.rowsRead.series} />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">D1 rows written</Card.Title>
				<Card.Description>{view.rowsWritten.summary}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Chart.Root
					series={view.rowsWritten.series}
					labels={view.labels}
					formatValue={formatCount}
					aria-label="D1 rows written per {view.unit} by database"
				/>
				{#if view.rowsWritten.series.length > 1}
					<Chart.Legend series={view.rowsWritten.series} />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="md:col-span-2">
			<Card.Header>
				<Card.Title class="text-base">R2 storage</Card.Title>
				<Card.Description>{view.storage.summary}</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Root
					type="area"
					series={view.storage.series}
					labels={view.labels}
					height={120}
					formatValue={formatBytes}
					aria-label="Bytes stored in the files bucket per {view.unit}"
				/>
			</Card.Content>
		</Card.Root>
	</div>
{/if}
