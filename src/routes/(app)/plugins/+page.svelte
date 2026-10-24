<script lang="ts">
	import { PLUGIN_CATEGORIES, PLUGIN_CATEGORY_LABELS } from '@pouchbasejs/plugin-sdk';
	import type { PluginCategory } from '@pouchbasejs/plugin-sdk';
	import { Debounced } from 'runed';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Select from '#lib/components/ui/inputs/select/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tile from '#lib/components/ui/tile/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import PluginTile from './plugin-tile.svelte';
	import { getInstalledPlugins, searchPlugins } from './plugins.remote';
	import UninstallPluginDialog from './uninstall-plugin-dialog.svelte';

	let tab = $state<'marketplace' | 'installed'>('marketplace');
	let search = $state('');
	let page = $state(1);
	let category = $state<PluginCategory | 'all'>('all');

	const categoryItems: Select.Item[] = [
		{ value: 'all', label: 'All categories' },
		...PLUGIN_CATEGORIES.map((value) => ({ value, label: PLUGIN_CATEGORY_LABELS[value] }))
	];

	const query = new Debounced(() => search.trim(), 300);

	const installed = $derived(await getInstalledPlugins());
	const results = $derived(
		await searchPlugins({
			query: query.current,
			page,
			category: category === 'all' ? undefined : category
		})
	);
	const installedById = $derived(
		Object.fromEntries(installed.map((plugin) => [plugin.id, plugin]))
	);
	const pages = $derived(results.list ? Math.ceil(results.list.total / results.list.perPage) : 0);

	const dialogs = Dialog.getDialogs();

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	/** `1 field type, 2 pages`: what a plugin adds. */
	function contributions(plugin: (typeof installed)[number]) {
		const { fields, pages, authProviders } = plugin.contributes;
		const parts = [
			[fields.length, 'field type', 'field types'],
			[pages.length, 'page', 'pages'],
			[authProviders.length, 'sign-in provider', 'sign-in providers']
		] as const;

		return (
			parts
				.filter(([count]) => count > 0)
				.map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
				.join(', ') || 'Nothing yet'
		);
	}
</script>

<svelte:head>
	<title>Plugins · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Plugins</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Plugins</Page.Title>
				<Page.Description>
					Add field types, pages and sign-in providers to Pouchbase. Plugins come from the plugin
					registry and run their server code in a Worker of their own on your Cloudflare account;
					built-in plugins ship with Pouchbase.
				</Page.Description>
			</div>

			<Segmented.Root
				aria-label="Plugins"
				value={tab}
				onValueChange={(value) => (tab = value as typeof tab)}
			>
				<Segmented.Item value="marketplace">Marketplace</Segmented.Item>
				<Segmented.Item value="installed">
					Installed
					{#if installed.length}
						<span class="text-zinc-400">{installed.length}</span>
					{/if}
				</Segmented.Item>
			</Segmented.Root>
		</Page.Header>

		<Callout.Root>
			<Icon.Root icon="lucide:flask-conical" class="size-4 shrink-0" />
			<p>
				Plugin support is in development. Installing a plugin deploys its server code and registers
				the sign-in providers it adds, but sign-in still uses the built-in providers, and field
				types and pages don't run yet.
			</p>
		</Callout.Root>

		{#if tab === 'marketplace'}
			<div class="flex flex-col gap-2 sm:flex-row">
				<Input.Root
					type="search"
					placeholder="Search plugins…"
					aria-label="Search plugins"
					class="flex-1"
					bind:value={() => search, (value) => ((search = value ?? ''), (page = 1))}
				/>
				<Select.Root
					items={categoryItems}
					aria-label="Category"
					class="sm:w-52"
					bind:value={
						() => category, (value) => ((category = value as typeof category), (page = 1))
					}
				/>
			</div>

			{#if results.error}
				<Callout.Root variant="error">
					<Icon.Root icon="lucide:cloud-off" class="size-4 shrink-0" />
					<p>{results.error}</p>
				</Callout.Root>
			{:else if results.list?.items.length}
				<Tile.Grid>
					{#each results.list.items as plugin (plugin.id)}
						<PluginTile {plugin} installed={installedById[plugin.id]} />
					{/each}
				</Tile.Grid>

				{#if pages > 1}
					<div class="flex items-center justify-between text-sm text-zinc-500">
						<span>Page {page} of {pages}</span>
						<div class="flex gap-2">
							<Button.Root variant="secondary" disabled={page <= 1} onclick={() => page--}>
								Previous
							</Button.Root>
							<Button.Root variant="secondary" disabled={page >= pages} onclick={() => page++}>
								Next
							</Button.Root>
						</div>
					</div>
				{/if}
			{:else}
				<Empty.Root>
					<Empty.Icon><Icon.Root icon="lucide:puzzle" /></Empty.Icon>
					<Empty.Title>
						{query.current || category !== 'all' ? 'No plugins found' : 'No plugins yet'}
					</Empty.Title>
					<Empty.Description>
						{query.current
							? 'Try another search term.'
							: category !== 'all'
								? 'No plugins in this category yet.'
								: 'Plugins published to the registry show up here.'}
					</Empty.Description>
				</Empty.Root>
			{/if}
		{:else if installed.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Plugin</Table.Head>
						<Table.Head>Version</Table.Head>
						<Table.Head>Adds</Table.Head>
						<Table.Head>Installed</Table.Head>
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each installed as plugin (plugin.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex min-w-0 flex-col">
									<span class="font-medium text-zinc-900">{plugin.name}</span>
									<span class="truncate text-xs text-zinc-500">{plugin.description}</span>
								</div>
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-1.5">
									<Badge.Root variant="outline" class="font-mono">{plugin.version}</Badge.Root>
									{#if plugin.embedded}
										<Badge.Root>Built in</Badge.Root>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">{contributions(plugin)}</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{plugin.installedAt ? dateFormat.format(plugin.installedAt) : 'With Pouchbase'}
							</Table.Cell>
							<Table.Cell class="text-right">
								{#if !plugin.embedded}
									<Button.Root
										variant="ghost"
										size="icon"
										aria-label={`Remove ${plugin.name}`}
										onclick={() => void dialogs.open(UninstallPluginDialog, { plugin })}
									>
										<Icon.Root icon="lucide:trash-2" />
									</Button.Root>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root>
				<Empty.Icon><Icon.Root icon="lucide:package-open" /></Empty.Icon>
				<Empty.Title>No plugins installed</Empty.Title>
				<Empty.Description>Find plugins in the marketplace and install them here.</Empty.Description
				>
				<Button.Root variant="secondary" onclick={() => (tab = 'marketplace')}>
					Browse the marketplace
				</Button.Root>
			</Empty.Root>
		{/if}
	</div>
</Page.Root>
