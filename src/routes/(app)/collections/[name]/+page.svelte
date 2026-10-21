<script lang="ts">
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as DataGrid from '#lib/components/ui/data-grid/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Checkbox from '#lib/components/ui/inputs/checkbox/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getCollection } from '../../collections.remote';
	import AddFieldDialog from './add-field-dialog.svelte';
	import ColumnHeader from './column-header.svelte';
	import DeleteCollectionDialog from './delete-collection-dialog.svelte';
	import DeleteFieldDialog from './delete-field-dialog.svelte';
	import DeleteRecordsDialog from './delete-records-dialog.svelte';
	import IndexesDialog from './indexes-dialog.svelte';
	import {
		fieldColumn,
		SIGN_IN_COLUMN,
		SYSTEM_COLUMNS,
		type GridField,
		type GridRecord
	} from './grid';
	import { USERS_COLLECTION } from '#lib/auth/users.js';
	import SignInMethods from './sign-in-methods.svelte';
	import RecordCell from './record-cell.svelte';
	import RecordSheet from './record-sheet.svelte';
	import { listRecords } from './records.remote';
	import RenameCollectionDialog from './rename-collection-dialog.svelte';
	import RenameFieldDialog from './rename-field-dialog.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	// Paging and sorting live in the URL, so they survive a reload and can be shared.
	const args = $derived.by(() => {
		const search = page.url.searchParams;
		const order = search.get('order');

		return {
			collection: params.name,
			page: Math.max(1, Number(search.get('page')) || 1),
			sort: search.get('sort') ?? undefined,
			order: order === 'asc' || order === 'desc' ? (order as 'asc' | 'desc') : undefined
		};
	});

	const [collection, data] = $derived(
		await Promise.all([getCollection(params.name), listRecords(args)])
	);

	const fields = $derived(data.fields as GridField[]);
	const records = $derived(data.items as GridRecord[]);
	const isUsers = $derived(collection.system && collection.name === USERS_COLLECTION);
	const columns = $derived([
		...SYSTEM_COLUMNS,
		...(isUsers ? [SIGN_IN_COLUMN] : []),
		...fields.map(fieldColumn)
	]);
	const signInMethods = $derived(data.signInMethods ?? {});
	const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.perPage)));
	const firstRow = $derived(data.total ? (data.page - 1) * data.perPage + 1 : 0);
	const lastRow = $derived(Math.min(data.page * data.perPage, data.total));

	// Only rows on the current page count as selected.
	const selection = new SvelteSet<string>();
	const selectedIds = $derived(records.filter((row) => selection.has(row.id)).map((row) => row.id));
	const allSelected = $derived(records.length > 0 && selectedIds.length === records.length);

	const dialogs = Dialog.getDialogs();

	let sheetOpen = $state(false);
	let editing = $state<GridRecord | null>(null);

	function navigate(changes: Record<string, string | null>) {
		const search = new SvelteURLSearchParams(page.url.search);

		for (const [key, value] of Object.entries(changes)) {
			if (value === null) {
				search.delete(key);
			} else {
				search.set(key, value);
			}
		}

		// SvelteKit 3 keeps scroll position and focus on `goto` unless `reset` is set.
		return goto(resolve(`/(app)/collections/[name]?${search}`, { name: params.name }));
	}

	function toggleAll() {
		if (allSelected) {
			selection.clear();
		} else {
			for (const row of records) {
				selection.add(row.id);
			}
		}
	}

	function toggle(id: string) {
		if (selection.has(id)) {
			selection.delete(id);
		} else {
			selection.add(id);
		}
	}

	function openRecord(record: GridRecord | null) {
		editing = record;
		sheetOpen = true;
	}

	async function confirmDelete(ids: string[]) {
		if (await dialogs.open(DeleteRecordsDialog, { collection, ids })) {
			for (const id of ids) {
				selection.delete(id);
			}

			sheetOpen = false;
		}
	}
</script>

<svelte:head>
	<title>{collection.name} · Collections</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Link href={resolve('/(app)')}>Collections</Breadcrumb.Link>
		</Breadcrumb.Item>
		<Breadcrumb.Separator />
		<Breadcrumb.Item>
			<Breadcrumb.Page>{collection.name}</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>

	<Topbar.Actions>
		{#if selectedIds.length}
			<Button.Root variant="ghost" onclick={() => selection.clear()}>Clear selection</Button.Root>
			<Button.Root variant="danger" onclick={() => void confirmDelete(selectedIds)}>
				<Icon.Root icon="lucide:trash-2" />
				Delete {selectedIds.length === 1 ? '1 record' : `${selectedIds.length} records`}
			</Button.Root>
		{:else}
			<Button.Root
				variant="secondary"
				onclick={() => void dialogs.open(AddFieldDialog, { collection })}
			>
				<Icon.Root icon="lucide:columns-3" />
				Add field
			</Button.Root>
			<Button.Root onclick={() => openRecord(null)}>
				<Icon.Root icon="lucide:plus" />
				New record
			</Button.Root>
		{/if}

		<DropdownMenu.Root>
			<DropdownMenu.Trigger variant="ghost" size="icon" aria-label="Collection actions">
				<Icon.Root icon="lucide:ellipsis" />
			</DropdownMenu.Trigger>

			<DropdownMenu.Content>
				<DropdownMenu.Item
					onSelect={() => void dialogs.open(IndexesDialog, { collection, fields })}
				>
					<Icon.Root icon="lucide:list-tree" />
					Indexes
				</DropdownMenu.Item>

				{#if !collection.system}
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
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Topbar.Actions>
</Topbar.Root>

<DataGrid.Root aria-label="Records of {collection.name}">
	<DataGrid.Header>
		<DataGrid.Head class="w-10">
			<Checkbox.Root
				checked={allSelected}
				indeterminate={selectedIds.length > 0 && !allSelected}
				disabled={!records.length}
				aria-label="Select all records on this page"
				onchange={toggleAll}
			/>
		</DataGrid.Head>

		{#each columns as column (column.name)}
			<DataGrid.Head class="min-w-40">
				<ColumnHeader
					{column}
					sorted={data.sort === column.name ? data.order : undefined}
					onSort={(order) => navigate({ sort: column.name, order, page: null })}
					onRename={() => {
						if (column.field) {
							void dialogs.open(RenameFieldDialog, { collection, field: column.field });
						}
					}}
					onDelete={() => {
						if (column.field) {
							void dialogs.open(DeleteFieldDialog, { collection, field: column.field });
						}
					}}
				/>
			</DataGrid.Head>
		{/each}

		<DataGrid.Head class="w-10 px-0">
			<Button.Root
				variant="ghost"
				size="icon"
				class="rounded-none"
				aria-label="Add field"
				onclick={() => void dialogs.open(AddFieldDialog, { collection })}
			>
				<Icon.Root icon="lucide:plus" />
			</Button.Root>
		</DataGrid.Head>
	</DataGrid.Header>

	<DataGrid.Body>
		{#each records as record (record.id)}
			<DataGrid.Row selected={selection.has(record.id)} onclick={() => openRecord(record)}>
				<DataGrid.Cell class="w-10" onclick={(event) => event.stopPropagation()}>
					<Checkbox.Root
						checked={selection.has(record.id)}
						aria-label="Select record {record.id}"
						onchange={() => toggle(record.id)}
					/>
				</DataGrid.Cell>

				{#each columns as column (column.name)}
					<DataGrid.Cell>
						{#if column.virtual === 'sign-in'}
							<SignInMethods methods={signInMethods[record.id] ?? []} />
						{:else}
							<RecordCell {column} value={record[column.name]} />
						{/if}
					</DataGrid.Cell>
				{/each}

				<DataGrid.Cell></DataGrid.Cell>
			</DataGrid.Row>
		{:else}
			<DataGrid.Empty columns={columns.length + 2}>
				No records yet.
				<Button.Root variant="secondary" class="ml-2" onclick={() => openRecord(null)}>
					<Icon.Root icon="lucide:plus" />
					New record
				</Button.Root>
			</DataGrid.Empty>
		{/each}
	</DataGrid.Body>
</DataGrid.Root>

<DataGrid.Footer>
	<span>
		{#if data.total}
			{firstRow}–{lastRow} of {data.total}
			{data.total === 1 ? 'record' : 'records'}
		{:else}
			0 records
		{/if}
	</span>

	<div class="flex items-center gap-2">
		<span>Page {data.page} of {pageCount}</span>
		<Button.Root
			variant="secondary"
			size="icon"
			aria-label="Previous page"
			disabled={data.page <= 1}
			onclick={() => navigate({ page: data.page > 2 ? String(data.page - 1) : null })}
		>
			<Icon.Root icon="lucide:chevron-left" />
		</Button.Root>
		<Button.Root
			variant="secondary"
			size="icon"
			aria-label="Next page"
			disabled={data.page >= pageCount}
			onclick={() => navigate({ page: String(data.page + 1) })}
		>
			<Icon.Root icon="lucide:chevron-right" />
		</Button.Root>
	</div>
</DataGrid.Footer>

<RecordSheet
	{collection}
	{fields}
	record={editing}
	signInMethods={editing ? signInMethods[editing.id] : undefined}
	bind:open={sheetOpen}
	onDelete={(id) => void confirmDelete([id])}
/>
