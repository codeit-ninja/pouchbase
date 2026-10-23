<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { getFunctionLogs } from '../functions.remote';
	import type { FunctionData, FunctionLog } from '../types';

	type Props = { fn: FunctionData };

	let { fn }: Props = $props();

	const RANGES = [
		{ value: '1', label: '1 hour' },
		{ value: '6', label: '6 hours' },
		{ value: '24', label: '24 hours' },
		{ value: '72', label: '3 days' }
	];

	let hours = $state<1 | 6 | 24 | 72>(24);

	const query = $derived(getFunctionLogs({ id: fn.id, hours }));
	const result = $derived(await query);

	const timeFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	function levelVariant(level: FunctionLog['level']) {
		if (level === 'error') {
			return 'danger';
		}

		return level === 'warn' ? 'warning' : 'neutral';
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="flex flex-col gap-1.5">
				<Card.Title>Logs</Card.Title>
				<Card.Description>
					Requests, <code>console.log()</code> output and errors, newest first. New lines show up after
					a minute or so. Cloudflare keeps them for 3 days, or 7 days on the Workers Paid plan.
				</Card.Description>
			</div>

			<div class="flex items-center gap-2">
				<Segmented.Root
					value={String(hours)}
					onValueChange={(next) => (hours = Number(next) as typeof hours)}
					aria-label="Period"
				>
					{#each RANGES as range (range.value)}
						<Segmented.Item value={range.value}>{range.label}</Segmented.Item>
					{/each}
				</Segmented.Root>

				<Button.Root
					variant="secondary"
					size="icon"
					aria-label="Refresh"
					onclick={() => query.refresh()}
				>
					<Icon.Root icon="lucide:refresh-cw" />
				</Button.Root>
			</div>
		</div>
	</Card.Header>

	<Card.Content>
		{#if result.forbidden}
			<Callout.Root variant="warning">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Title>The API token can't read logs</Callout.Title>
					<Callout.Description>
						To see the logs here, add the account permission
						<strong class="font-medium">Workers Observability: Edit</strong> to the token in
						<code>CLOUDFLARE_API_TOKEN</code>.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{:else if result.logs.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Time</Table.Head>
						<Table.Head>Level</Table.Head>
						<Table.Head>Message</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each result.logs as log (log.id)}
						<Table.Row>
							<Table.Cell class="align-top text-xs whitespace-nowrap text-zinc-500 tabular-nums">
								{timeFormat.format(log.timestamp)}
							</Table.Cell>
							<Table.Cell class="align-top">
								<Badge.Root variant={levelVariant(log.level)}>{log.level}</Badge.Root>
							</Table.Cell>
							<Table.Cell class="font-mono text-xs break-all whitespace-pre-wrap text-zinc-900">
								{log.message}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="py-8">
				<Empty.Description>
					{fn.deployed ? 'No logs in this period.' : 'Deploy the function to see its logs.'}
				</Empty.Description>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
