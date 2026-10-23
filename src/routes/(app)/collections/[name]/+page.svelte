<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as DataGrid from '#lib/components/ui/data-grid/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Checkbox from '#lib/components/ui/inputs/checkbox/index.js';
	import { getCollection } from '../../collections.remote';
	import CollectionTopbar from './collection-topbar.svelte';
	import ColumnHeader from './column-header.svelte';
	import DeleteFieldDialog from './delete-field-dialog.svelte';
	import DeleteRecordsDialog from './delete-records-dialog.svelte';
	import EditCollectionSheet from './edit-collection-sheet.svelte';
	import {
		fieldColumn,
		PREVIEW_COLUMN,
		lastUpdated,
		SIGN_IN_COLUMN,
		type GridField,
		type GridRecord
	} from './grid';
	import type { SignInMethod } from '#lib/auth/sign-in-methods.js';
	import { USERS_COLLECTION } from '#lib/auth/users.js';
	import * as Thumbnail from '#lib/components/ui/thumbnail/index.js';
	import * as Gallery from '#lib/components/ui/gallery/index.js';
	import { isAutoType } from '#lib/fields/field-types.js';
	import { FILES_COLLECTION, fileUrl, formatFileSize, isInlineImage } from '#lib/files/files.js';
	import { previewThumbnail } from '#lib/files/thumbnails.js';
	import ApiSheet from './api-sheet.svelte';
	import CollectionSettingsSheet from './collection-settings-sheet.svelte';
	import { getCollectionSettings } from './collection-settings.remote';
	import ImageEditorDialog from './image-editor-dialog.svelte';
	import SignInMethods from './sign-in-methods.svelte';
	import RecordCell from './record-cell.svelte';
	import RecordSheet from './record-sheet.svelte';
	import { getRecord, listRecords } from './records.remote';
	import RenameFieldDialog from './rename-field-dialog.svelte';
	import EditComputedDialog from './edit-computed-dialog.svelte';
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

	const [collection, data, settings] = $derived(
		await Promise.all([
			getCollection(params.name),
			listRecords(args),
			getCollectionSettings(params.name)
		])
	);

	const fields = $derived(data.fields as GridField[]);
	const records = $derived(data.items as GridRecord[]);
	const isUsers = $derived(collection.system && collection.name === USERS_COLLECTION);
	const isFiles = $derived(collection.system && collection.name === FILES_COLLECTION);
	const relationTargets = $derived(data.relationTargets ?? {});
	const fieldColumns = $derived(
		fields.map((field) => ({
			...fieldColumn(field),
			relationTarget: relationTargets[field.name],
			fileSize: isFiles && field.name === 'size'
		}))
	);
	// Virtual columns of built-in collections go after the leading id and timestamp fields.
	const leading = $derived.by(() => {
		const index = fields.findIndex((field) => !isAutoType(field.type));

		return index === -1 ? fields.length : index;
	});
	const columns = $derived([
		...fieldColumns.slice(0, leading),
		...(isUsers ? [SIGN_IN_COLUMN] : []),
		...(isFiles ? [PREVIEW_COLUMN] : []),
		...fieldColumns.slice(leading)
	]);
	const signInMethods = $derived(data.signInMethods ?? {});

	// `files` can be shown as a grid of large previews; the layout lives in the URL too.
	const view = $derived(isFiles && page.url.searchParams.get('view') === 'grid' ? 'grid' : 'table');
	// Use a configured thumbnail size close to the preview's size, if there is one.
	const smallPreview = $derived(previewThumbnail(settings.thumbnails, 48));
	const largePreview = $derived(previewThumbnail(settings.thumbnails, 400));

	function previewUrl(record: GridRecord, thumb: string | null) {
		return isInlineImage(String(record.mime_type ?? ''))
			? fileUrl(record._key, { thumb, version: lastUpdated(record, fields) })
			: null;
	}
	const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.perPage)));
	const firstRow = $derived(data.total ? (data.page - 1) * data.perPage + 1 : 0);
	const lastRow = $derived(Math.min(data.page * data.perPage, data.total));

	// Only rows on the current page count as selected.
	const selection = new SvelteSet<string>();
	const selectedIds = $derived(
		records.filter((row) => selection.has(row._key)).map((row) => row._key)
	);
	const allSelected = $derived(records.length > 0 && selectedIds.length === records.length);

	const dialogs = Dialog.getDialogs();

	let sheetOpen = $state(false);
	let settingsOpen = $state(false);
	let apiOpen = $state(false);
	// The edit collection sheet, optionally starting with the new field dialog (the add button in the
	// grid header). Also opened by navigating here with `editCollection` state, after creating it.
	let editor = $derived<'fields' | 'new-field' | null>(page.state.editCollection ? 'fields' : null);

	function editCollection(newField = false) {
		editor = newField ? 'new-field' : 'fields';
	}
	let opened = $state<GridRecord | null>(null);
	// The collection the sheet was opened in: a link to another collection closes it until the
	// linked record is in.
	let openedIn = $state(untrack(() => params.name));
	// Sign-in methods of a user opened through a link, who may not be on the current page.
	let openedSignInMethods = $state<SignInMethod[]>();
	// The latest version of the open record, so the sheet shows changes made elsewhere (e.g. an
	// edited image) after the data refreshes.
	const editing = $derived(opened && (records.find((row) => row._key === opened?._key) ?? opened));

	const linkedId = $derived(page.url.searchParams.get('record'));

	// `?record=<id>` opens that record, e.g. from a link to a related record. It may be on another
	// page of the grid, so it's read on its own.
	$effect(() => {
		const collection = params.name;
		const id = linkedId;

		if (!id) {
			return;
		}

		let current = true;

		void getRecord({ collection, id }).then((found) => {
			if (current && found) {
				openRecord(found.item as GridRecord, found.signInMethods);
			}
		});

		return () => {
			current = false;
		};
	});

	function navigate(changes: Record<string, string | null>, options?: { replaceState?: boolean }) {
		const search = new SvelteURLSearchParams(page.url.search);

		for (const [key, value] of Object.entries(changes)) {
			if (value === null) {
				search.delete(key);
			} else {
				search.set(key, value);
			}
		}

		// SvelteKit 3 keeps scroll position and focus on `goto` unless `reset` is set.
		return goto(resolve(`/(app)/collections/[name]?${search}`, { name: params.name }), options);
	}

	function toggleAll() {
		if (allSelected) {
			selection.clear();
		} else {
			for (const row of records) {
				selection.add(row._key);
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

	function openRecord(record: GridRecord | null, signIn?: SignInMethod[]) {
		opened = record;
		openedIn = params.name;
		openedSignInMethods = signIn;
		sheetOpen = true;
	}

	function setSheetOpen(open: boolean) {
		sheetOpen = open;

		// Closing a record opened through a link drops it from the URL, so a reload doesn't reopen it.
		if (!open && page.url.searchParams.has('record')) {
			void navigate({ record: null }, { replaceState: true });
		}
	}

	// Opens on top of the record sheet, which stays open behind it.
	function editImage(record: GridRecord) {
		void dialogs.open(ImageEditorDialog, {
			file: {
				id: record._key,
				name: String(record.name ?? ''),
				mimeType: String(record.mime_type ?? ''),
				// `files` always has its `updated_at` field; it is built-in.
				version: lastUpdated(record, fields) ?? 0
			}
		});
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

<CollectionTopbar
	name={params.name}
	{collection}
	selected={selectedIds}
	onClearSelection={() => selection.clear()}
	onDeleteSelected={() => void confirmDelete(selectedIds)}
	onNewRecord={() => openRecord(null)}
	onOpenSettings={() => (settingsOpen = true)}
	onOpenApi={() => (apiOpen = true)}
	onEditCollection={() => editCollection()}
	{view}
	onViewChange={isFiles
		? (next) => void navigate({ view: next === 'grid' ? 'grid' : null })
		: undefined}
/>

{#if view === 'grid'}
	<Gallery.Root aria-label="Files">
		{#each records as record (record._key)}
			<Gallery.Item selected={selection.has(record._key)}>
				<Gallery.Button onclick={() => openRecord(record)}>
					<Thumbnail.Root
						src={previewUrl(record, largePreview)}
						alt={String(record.name ?? '')}
						size="fill"
					>
						<Icon.Root icon="lucide:file" />
					</Thumbnail.Root>
					<Gallery.Label>{record.name}</Gallery.Label>
					<Gallery.Meta>
						{record.mime_type} · {formatFileSize(Number(record.size ?? 0))}
					</Gallery.Meta>
				</Gallery.Button>
				<Gallery.Check
					checked={selection.has(record._key)}
					aria-label="Select {record.name}"
					onchange={() => toggle(record._key)}
				/>
			</Gallery.Item>
		{:else}
			<li class="col-span-full py-12 text-center text-sm text-zinc-500">
				No files yet.
				<Button.Root variant="secondary" class="ml-2" onclick={() => openRecord(null)}>
					<Icon.Root icon="lucide:plus" />
					Upload a file
				</Button.Root>
			</li>
		{/each}
	</Gallery.Root>
{:else}
	<!-- Paging and sorting keep the current rows on screen (dimmed) until the new ones are in. -->
	<DataGrid.Root aria-label="Records of {collection.name}" busy={$effect.pending() > 0}>
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
						onEditComputation={() => {
							if (column.field) {
								void dialogs.open(EditComputedDialog, { collection, field: column.field, fields });
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
					onclick={() => editCollection(true)}
				>
					<Icon.Root icon="lucide:plus" />
				</Button.Root>
			</DataGrid.Head>
		</DataGrid.Header>

		<DataGrid.Body>
			{#each records as record (record._key)}
				<DataGrid.Row selected={selection.has(record._key)} onclick={() => openRecord(record)}>
					<DataGrid.Cell class="w-10" onclick={(event) => event.stopPropagation()}>
						<Checkbox.Root
							checked={selection.has(record._key)}
							aria-label="Select record {record._key}"
							onchange={() => toggle(record._key)}
						/>
					</DataGrid.Cell>

					{#each columns as column (column.name)}
						<DataGrid.Cell>
							{#if column.virtual === 'sign-in'}
								<SignInMethods methods={signInMethods[record._key] ?? []} />
							{:else if column.virtual === 'preview'}
								<Thumbnail.Root
									src={previewUrl(record, smallPreview)}
									preview={previewUrl(record, largePreview)}
									alt={String(record.name ?? '')}
									size="sm"
								>
									<Icon.Root icon="lucide:file" />
								</Thumbnail.Root>
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
{/if}

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
	{relationTargets}
	signInMethods={editing ? (signInMethods[editing._key] ?? openedSignInMethods) : undefined}
	bind:open={() => sheetOpen && openedIn === params.name, setSheetOpen}
	onDelete={(id) => void confirmDelete([id])}
	onEditImage={isFiles ? editImage : undefined}
/>

<CollectionSettingsSheet {collection} bind:open={settingsOpen} />

<ApiSheet {collection} {fields} {relationTargets} rules={settings.rules} bind:open={apiOpen} />

<EditCollectionSheet
	{collection}
	{fields}
	newField={editor === 'new-field'}
	bind:open={() => editor !== null, (open) => (editor = open ? (editor ?? 'fields') : null)}
/>
