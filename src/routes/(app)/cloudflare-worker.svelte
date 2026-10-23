<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { formatDate } from '#lib/cloudflare/format.js';
	import { getCloudflareWorker } from './cloudflare.remote';
	import CloudflareSectionNotice from './cloudflare-section-notice.svelte';

	const result = $derived(await getCloudflareWorker());

	const bindingTypes: Record<string, string> = {
		assets: 'Static assets',
		secret_text: 'Secret',
		plain_text: 'Variable',
		json: 'Variable (JSON)',
		d1: 'D1 database',
		r2_bucket: 'R2 bucket',
		kv_namespace: 'KV namespace',
		durable_object_namespace: 'Durable Object',
		queue: 'Queue',
		service: 'Service',
		ai: 'Workers AI',
		analytics_engine: 'Analytics Engine',
		version_metadata: 'Version metadata'
	};
</script>

{#if !result.ok}
	<CloudflareSectionNotice {result} />
{:else if !result.data}
	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:server" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>No Worker named "pouchbase" is deployed on this account</Callout.Title>
			<Callout.Description>
				Its bindings show up here once it is deployed with
				<span class="font-mono">pnpm wrangler deploy</span>.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>
{:else}
	{@const worker = result.data}

	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
			<span class="flex items-center gap-2 text-zinc-900">
				<Icon.Root icon="lucide:server" class="size-4 text-zinc-500" />
				<span class="font-mono">{worker.name}</span>
			</span>
			<Badge.Root class="bg-emerald-50 text-emerald-700">
				<Icon.Root icon="lucide:circle-check" />
				Deployed
			</Badge.Root>
			{#if worker.compatibilityDate}
				<span>Compatibility date {worker.compatibilityDate}</span>
			{/if}
			<span>Last deployed {formatDate(worker.modifiedOn)}</span>
		</div>

		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Binding</Table.Head>
					<Table.Head>Type</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each worker.bindings as binding (binding.name)}
					<Table.Row>
						<Table.Cell class="font-mono text-xs">{binding.name}</Table.Cell>
						<Table.Cell>{bindingTypes[binding.type] ?? binding.type}</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={2} class="text-zinc-500">This Worker has no bindings.</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>

		<Callout.Root variant="info">
			<Callout.Icon><Icon.Root icon="lucide:info" /></Callout.Icon>
			<Callout.Body>
				<Callout.Description>
					Pouchbase reaches its D1 databases and R2 bucket through the Cloudflare REST API with the
					account ID and API token secrets, so no D1 or R2 bindings appear here.
				</Callout.Description>
			</Callout.Body>
		</Callout.Root>
	</div>
{/if}
