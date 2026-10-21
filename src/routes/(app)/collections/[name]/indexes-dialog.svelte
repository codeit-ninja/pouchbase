<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { createIndexSchema } from '#lib/schemas/indexes.js';
	import { SYSTEM_COLUMNS, type GridField } from './grid';
	import { createIndex, deleteIndex, listIndexes } from './indexes.remote';

	type Props = {
		collection: { id: string; name: string };
		fields: GridField[];
	} & DialogProps;

	let { collection, fields }: Props = $props();

	// Not awaited, so the dialog opens right away and shows a spinner while loading.
	const indexesQuery = $derived(listIndexes(collection.name));
	const indexes = $derived(indexesQuery.current ?? []);

	const form = $derived(createIndex.for(collection.id).preflight(createIndexSchema));

	const columnItems = $derived([
		...SYSTEM_COLUMNS.map((column) => ({ value: column.name, label: column.name })),
		...fields
			.filter((field) => field.type !== 'blob')
			.map((field) => ({ value: field.name, label: field.name }))
	]);
</script>

<Dialog.Content class="max-w-2xl">
	<Dialog.Header>
		<Dialog.Title>Indexes</Dialog.Title>
		<Dialog.Description>
			Indexes on <span class="font-mono">{collection.name}</span> make filtering and sorting faster. Unique
			indexes also prevent duplicate values.
		</Dialog.Description>
	</Dialog.Header>

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
				{@const remove = deleteIndex.for(index.name)}

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
							<Form.Root form={remove}>
								<Form.Hidden field={remove.fields.collection} value={collection.name} />
								<Form.Hidden field={remove.fields.name} value={index.name} />
								<Form.Submit variant="ghost" size="icon" aria-label="Delete index {index.name}">
									<Icon.Root icon="lucide:trash-2" />
								</Form.Submit>
							</Form.Root>
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

	<Form.Root
		{form}
		class="border-t border-zinc-200 pt-4"
		enhance={async (instance) => {
			if (await instance.submit()) {
				instance.element.reset();
			}
		}}
	>
		<h3 class="text-sm font-semibold text-zinc-900">Add index</h3>

		<Form.Hidden field={form.fields.collection} value={collection.name} />

		<Form.Field field={form.fields.columns}>
			<Form.Label>Columns</Form.Label>
			<Form.MultiSelect items={columnItems} placeholder="Choose columns…" />
			<Form.Description
				>The order matters: put the column you filter on most first.</Form.Description
			>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.unique} orientation="horizontal">
			<Form.Checkbox />
			<Form.Label>Unique</Form.Label>
			<Form.Description class="w-full pl-6">
				No two records can have the same combination of values.
			</Form.Description>
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Close</Dialog.Close>
			<Form.Submit>
				<Icon.Root icon="lucide:plus" />
				Add index
			</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
