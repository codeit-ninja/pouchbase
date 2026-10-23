<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import DeleteCollectionDialog from './delete-collection-dialog.svelte';
	import RenameCollectionDialog from './rename-collection-dialog.svelte';

	type Props = {
		/** Collection name from the URL, so the breadcrumb can render before the data is in. */
		name: string;
		/** Leave it out while the collection loads; the actions are then disabled. */
		collection?: { id: string; name: string; system: boolean };
		/**
		 * The realtime connection that keeps the records up to date: "Live" when open, "Offline" when
		 * closed, nothing while connecting or when left out.
		 */
		live?: 'connecting' | 'open' | 'closed';
		/** Ids of the selected records; switches the actions to bulk actions. */
		selected?: string[];
		onClearSelection?: () => void;
		onDeleteSelected?: () => void;
		onNewRecord?: () => void;
		onOpenSettings?: () => void;
		onOpenApi?: () => void;
		onEditCollection?: () => void;
		/** Current layout; the toggle only shows when `onViewChange` is given (e.g. for `files`). */
		view?: 'table' | 'grid';
		onViewChange?: (view: 'table' | 'grid') => void;
	};

	let {
		name,
		collection,
		live,
		selected = [],
		onClearSelection,
		onDeleteSelected,
		onNewRecord,
		onOpenSettings,
		onOpenApi,
		onEditCollection,
		view = 'table',
		onViewChange
	}: Props = $props();

	const dialogs = Dialog.getDialogs();
</script>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Link href={resolve('/(app)')}>Collections</Breadcrumb.Link>
		</Breadcrumb.Item>
		<Breadcrumb.Separator />
		<Breadcrumb.Item>
			<Breadcrumb.Page>{name}</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>

	<Topbar.Actions>
		{#if live === 'open'}
			<Badge.Root variant="success" title="Changes show up as they are saved">
				<Icon.Root icon="lucide:radio" />
				Live
			</Badge.Root>
		{:else if live === 'closed'}
			<Badge.Root variant="outline" title="Not connected; reload to see the latest changes">
				<Icon.Root icon="lucide:unplug" />
				Offline
			</Badge.Root>
		{/if}

		{#if selected.length}
			<Button.Root variant="ghost" onclick={onClearSelection}>Clear selection</Button.Root>
			<Button.Root variant="danger" onclick={onDeleteSelected}>
				<Icon.Root icon="lucide:trash-2" />
				Delete {selected.length === 1 ? '1 record' : `${selected.length} records`}
			</Button.Root>
		{:else}
			{#if onViewChange}
				<Segmented.Root
					value={view}
					aria-label="Layout"
					onValueChange={(next) => onViewChange(next === 'grid' ? 'grid' : 'table')}
				>
					<Segmented.Item value="table" aria-label="Table">
						<Icon.Root icon="lucide:table-2" class="size-3.5" />
					</Segmented.Item>
					<Segmented.Item value="grid" aria-label="Grid">
						<Icon.Root icon="lucide:layout-grid" class="size-3.5" />
					</Segmented.Item>
				</Segmented.Root>
				<Topbar.Separator />
			{/if}

			<Button.Root variant="secondary" disabled={!collection} onclick={onEditCollection}>
				<Icon.Root icon="lucide:pencil" />
				Edit collection
			</Button.Root>
			<Button.Root variant="secondary" disabled={!collection} onclick={onOpenApi}>
				<Icon.Root icon="lucide:code-xml" />
				API
			</Button.Root>
			<Button.Root variant="secondary" disabled={!collection} onclick={onOpenSettings}>
				<Icon.Root icon="lucide:sliders-horizontal" />
				Settings
			</Button.Root>
			<Button.Root disabled={!collection} onclick={onNewRecord}>
				<Icon.Root icon="lucide:plus" />
				New record
			</Button.Root>
		{/if}

		<!-- System collections can't be renamed or deleted, so they have no actions here. -->
		{#if !collection?.system}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					variant="ghost"
					size="icon"
					aria-label="Collection actions"
					disabled={!collection}
				>
					<Icon.Root icon="lucide:ellipsis" />
				</DropdownMenu.Trigger>

				{#if collection}
					<DropdownMenu.Content>
						<DropdownMenu.Item
							onSelect={() => void dialogs.open(RenameCollectionDialog, { collection })}
						>
							<Icon.Root icon="lucide:pencil" />
							Rename collection
						</DropdownMenu.Item>

						<DropdownMenu.Separator />

						<DropdownMenu.Item
							variant="danger"
							onSelect={() => void dialogs.open(DeleteCollectionDialog, { collection })}
						>
							<Icon.Root icon="lucide:trash-2" />
							Delete collection
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				{/if}
			</DropdownMenu.Root>
		{/if}
	</Topbar.Actions>
</Topbar.Root>
