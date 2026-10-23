<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import type { GridField } from './grid';
	import IndexDialog from './index-dialog.svelte';
	import { deleteIndex, listIndexes } from './indexes.remote';

	type Props = {
		collection: { id: string; name: string };
		/** The saved fields, to choose columns from. */
		fields: GridField[];
	};

	let { collection, fields }: Props = $props();

	const dialogs = Dialog.getDialogs();

	// Not awaited, so the sheet opens right away and shows a spinner while loading.
	const indexesQuery = $derived(listIndexes(collection.name));
	const indexes = $derived(indexesQuery.current ?? []);

	// Opens on top of the sheet and saves right away, like a new field.
	function openIndex(index?: { name: string; columns: string[]; unique: boolean }) {
		void dialogs.open(IndexDialog, { collection, fields, index });
	}

	async function remove(name: string) {
		try {
			await deleteIndex({ collection: collection.name, name });
			toast.success('Index deleted');
		} catch (error) {
			toast.error(
				(error as { body?: { message?: string } })?.body?.message ?? "The index couldn't be deleted"
			);
		}
	}
</script>

<section class="flex flex-col gap-3" aria-labelledby="collection-indexes">
	<div class="flex flex-col gap-1">
		<h3 id="collection-indexes" class="text-sm font-semibold text-zinc-900">Indexes</h3>
		<p class="text-sm text-zinc-500">
			Make filtering and sorting faster. Changes to indexes are saved right away.
		</p>
	</div>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Columns</Table.Head>
				<Table.Head>Type</Table.Head>
				<Table.Head class="w-0"><span class="sr-only">Actions</span></Table.Head>
			</Table.Row>
		</Table.Header>

		<Table.Body>
			{#each indexes as index (index.name)}
				<Table.Row>
					<Table.Cell>
						<span class="font-mono text-zinc-900">{index.columns.join(', ')}</span>
						<span class="block font-mono text-xs text-zinc-400">{index.name}</span>
					</Table.Cell>
					<Table.Cell>
						<div class="flex flex-wrap gap-1">
							<Badge.Root>{index.unique ? 'Unique' : 'Index'}</Badge.Root>

							{#if index.managedBy}
								<Badge.Root variant="outline" title="Remove “Unique” from this field instead">
									<Icon.Root icon="lucide:lock" />
									Field {index.managedBy}
								</Badge.Root>
							{/if}
						</div>
					</Table.Cell>
					<Table.Cell>
						{#if !index.managedBy}
							<div class="flex justify-end">
								<Button.Root
									variant="ghost"
									size="icon"
									aria-label="Edit index {index.name}"
									title="Edit"
									onclick={() => openIndex(index)}
								>
									<Icon.Root icon="lucide:pencil" />
								</Button.Root>
								<Button.Root
									variant="ghost"
									size="icon"
									aria-label="Delete index {index.name}"
									title="Delete"
									class="hover:text-red-600"
									onclick={() => remove(index.name)}
								>
									<Icon.Root icon="lucide:trash-2" />
								</Button.Root>
							</div>
						{/if}
					</Table.Cell>
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={3} class="py-6 text-center text-zinc-500">
						{#if indexesQuery.error}
							Couldn't load the indexes.
						{:else if !indexesQuery.ready}
							<Spinner.Root label="Loading indexes" />
						{:else}
							No indexes yet.
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<Button.Root variant="secondary" class="self-start" onclick={() => openIndex()}>
		<Icon.Root icon="lucide:plus" />
		New index
	</Button.Root>
</section>
