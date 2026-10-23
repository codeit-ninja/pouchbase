<script lang="ts">
	import type { PluginSummary } from '@pouchbasejs/plugin-sdk';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Tile from '#lib/components/ui/tile/index.js';
	import InstallPluginDialog from './install-plugin-dialog.svelte';
	import type { InstalledPlugin } from './types';

	type Props = {
		plugin: PluginSummary;
		/** The installed version of this plugin, if any. */
		installed?: InstalledPlugin;
	};

	let { plugin, installed }: Props = $props();

	const dialogs = Dialog.getDialogs();

	const upToDate = $derived(installed?.version === plugin.version);
</script>

<Tile.Root>
	<Tile.Header>
		<Tile.Icon class="overflow-hidden">
			{#if plugin.iconUrl}
				<img src={plugin.iconUrl} alt="" class="size-full object-cover" />
			{:else}
				<Icon.Root icon="lucide:puzzle" />
			{/if}
		</Tile.Icon>

		<div class="flex min-w-0 flex-1 flex-col">
			<div class="flex min-w-0 items-center gap-1.5">
				<Tile.Title>{plugin.name}</Tile.Title>
				{#if plugin.verified}
					<Icon.Root icon="lucide:badge-check" label="Verified" class="size-4 text-emerald-600" />
				{/if}
			</div>
			{#if plugin.author}
				<span class="truncate text-xs text-zinc-500">{plugin.author}</span>
			{/if}
		</div>
	</Tile.Header>

	<Tile.Description class="line-clamp-3">{plugin.description}</Tile.Description>

	<Tile.Footer class="justify-between">
		<Badge.Root variant="outline" class="font-mono">{plugin.version}</Badge.Root>

		{#if upToDate}
			<Badge.Root variant="success">
				<Icon.Root icon="lucide:check" />
				Installed
			</Badge.Root>
		{:else}
			<Button.Root
				variant="secondary"
				onclick={() =>
					void dialogs.open(InstallPluginDialog, { plugin, installedVersion: installed?.version })}
			>
				{installed ? 'Update' : 'Install'}
			</Button.Root>
		{/if}
	</Tile.Footer>
</Tile.Root>
