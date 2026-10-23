<script lang="ts">
	import type { D1Resource } from '#lib/cloudflare/types.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tile from '#lib/components/ui/tile/index.js';
	import { formatBytes, formatDate } from '#lib/cloudflare/format.js';
	import { getCloudflareResources } from './cloudflare.remote';
	import CloudflareSectionNotice from './cloudflare-section-notice.svelte';
	import CloudflareStatusBadge from './cloudflare-status-badge.svelte';

	const result = $derived(await getCloudflareResources());

	const roles: Record<D1Resource['role'], { title: string; description: string }> = {
		system: { title: 'System database', description: 'Admin accounts, sessions and settings.' },
		app: { title: 'App database', description: 'The records of your collections.' }
	};

	function databaseUrl(accountId: string, database: D1Resource) {
		return database.id
			? `https://dash.cloudflare.com/${accountId}/workers/d1/databases/${database.id}`
			: `https://dash.cloudflare.com/${accountId}/workers/d1`;
	}

	function bucketUrl(accountId: string, name: string) {
		return `https://dash.cloudflare.com/${accountId}/r2/default/buckets/${encodeURIComponent(name)}`;
	}
</script>

{#if !result.ok}
	<CloudflareSectionNotice {result} />
{:else}
	{@const { accountId, databases, bucket, others } = result.data}

	<Tile.Grid>
		{#each databases as database (database.role)}
			<Tile.Root>
				<Tile.Header>
					<Tile.Icon><Icon.Root icon="lucide:database" /></Tile.Icon>
					<Tile.Title>{roles[database.role].title}</Tile.Title>
				</Tile.Header>

				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between gap-2">
						<Tile.Value>
							{database.sizeBytes === null ? '—' : formatBytes(database.sizeBytes)}
						</Tile.Value>
						<CloudflareStatusBadge status={database.status} />
					</div>
					<Tile.Description>
						{#if database.name}
							<span class="font-mono text-xs text-zinc-700">{database.name}</span>
							{#if database.tables !== null}
								· {database.tables} {database.tables === 1 ? 'table' : 'tables'}
							{/if}
						{:else}
							{roles[database.role].description}
						{/if}
					</Tile.Description>
				</div>

				<Tile.Footer class="justify-between text-xs text-zinc-500">
					<span>Created {formatDate(database.createdAt)}</span>
					<Button.Root
						variant="ghost"
						size="icon-sm"
						href={databaseUrl(accountId, database)}
						target="_blank"
						rel="noreferrer"
						aria-label="Open {roles[database.role].title} in the Cloudflare dashboard"
					>
						<Icon.Root icon="lucide:external-link" />
					</Button.Root>
				</Tile.Footer>
			</Tile.Root>
		{/each}

		<Tile.Root>
			<Tile.Header>
				<Tile.Icon><Icon.Root icon="lucide:hard-drive" /></Tile.Icon>
				<Tile.Title>Files bucket</Tile.Title>
			</Tile.Header>

			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between gap-2">
					<Tile.Value>{bucket.location ?? '—'}</Tile.Value>
					<CloudflareStatusBadge status={bucket.status} />
				</div>
				<Tile.Description>
					{#if bucket.name}
						<span class="font-mono text-xs text-zinc-700">{bucket.name}</span>
						{#if bucket.location}
							· R2 region
						{/if}
					{:else}
						Uploaded files and thumbnails. Created on the first upload.
					{/if}
				</Tile.Description>
			</div>

			<Tile.Footer class="justify-between text-xs text-zinc-500">
				<span>Created {formatDate(bucket.createdAt)}</span>
				{#if bucket.name}
					<Button.Root
						variant="ghost"
						size="icon-sm"
						href={bucketUrl(accountId, bucket.name)}
						target="_blank"
						rel="noreferrer"
						aria-label="Open the files bucket in the Cloudflare dashboard"
					>
						<Icon.Root icon="lucide:external-link" />
					</Button.Root>
				{/if}
			</Tile.Footer>
		</Tile.Root>
	</Tile.Grid>

	{#if others.length}
		<Collapsible.Root>
			<Collapsible.Trigger>
				Other resources on this account ({others.length})
			</Collapsible.Trigger>
			<Collapsible.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Type</Table.Head>
							<Table.Head>Name</Table.Head>
							<Table.Head>Created</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each others as resource (`${resource.kind}:${resource.name}`)}
							<Table.Row>
								<Table.Cell class="whitespace-nowrap">
									{resource.kind === 'd1' ? 'D1 database' : 'R2 bucket'}
								</Table.Cell>
								<Table.Cell class="font-mono text-xs">{resource.name}</Table.Cell>
								<Table.Cell class="whitespace-nowrap">{formatDate(resource.createdAt)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
{/if}
