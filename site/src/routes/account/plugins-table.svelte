<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { categoryLabel } from '#lib/plugin-categories.js';
	import { getMyPlugins } from './account.remote';

	const plugins = $derived(await getMyPlugins());

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
</script>

{#if plugins.length}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Plugin</Table.Head>
				<Table.Head>Version</Table.Head>
				<Table.Head>Downloads</Table.Head>
				<Table.Head>Updated</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each plugins as plugin (plugin.id)}
				<Table.Row>
					<Table.Cell>
						<span class="flex flex-col gap-0.5">
							<span class="flex items-center gap-2 font-medium text-zinc-900">
								{plugin.name}
								{#if plugin.verified}
									<Badge.Root variant="brand">Verified</Badge.Root>
								{/if}
							</span>
							<span class="font-mono text-xs text-zinc-500">{plugin.slug}</span>
							{#if plugin.categories.length}
								<span class="mt-1 flex flex-wrap gap-1">
									{#each plugin.categories as category (category)}
										<Badge.Root variant="outline">{categoryLabel(category)}</Badge.Root>
									{/each}
								</span>
							{/if}
						</span>
					</Table.Cell>
					<Table.Cell class="font-mono text-xs">{plugin.version}</Table.Cell>
					<Table.Cell>{plugin.downloads}</Table.Cell>
					<Table.Cell class="whitespace-nowrap">
						{dateFormat.format(new Date(plugin.updatedAt))}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{:else}
	<Empty.Root>
		<Empty.Icon><Icon.Root icon="lucide:puzzle" /></Empty.Icon>
		<Empty.Title>No plugins yet</Empty.Title>
		<Empty.Description>
			Publish the first version of a plugin above, or with the CLI and a publish token.
		</Empty.Description>
	</Empty.Root>
{/if}
