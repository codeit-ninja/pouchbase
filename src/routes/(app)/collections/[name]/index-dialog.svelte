<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { createIndexSchema, updateIndexSchema } from '#lib/schemas/indexes.js';
	import type { GridField } from './grid';
	import { createIndex, updateIndex } from './indexes.remote';

	type Props = {
		collection: { id: string; name: string };
		fields: GridField[];
		/** The custom index to change; leave it out to add one. */
		index?: { name: string; columns: string[]; unique: boolean };
	} & DialogProps;

	let { collection, fields, index, close }: Props = $props();

	const update = $derived(index && updateIndex.for(index.name).preflight(updateIndexSchema));
	const form = $derived(update || createIndex.for(collection.id).preflight(createIndexSchema));

	const columnItems = $derived(
		fields
			.filter((field) => field.type !== 'blob')
			.map((field) => ({ value: field.name, label: field.name }))
	);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>{index ? 'Edit index' : 'New index'}</Dialog.Title>
		<Dialog.Description>
			Indexes make filtering and sorting faster. Unique indexes also prevent duplicate values.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success={index ? 'Index saved' : 'Index created'}
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.collection} value={collection.name} />

		{#if index && update}
			<Form.Hidden field={update.fields.name} value={index.name} />
		{/if}

		<Form.Field field={form.fields.columns}>
			<Form.Label>Columns</Form.Label>
			<Form.MultiSelect
				items={columnItems}
				defaultValue={index?.columns}
				placeholder="Choose columns…"
			/>
			<Form.Description
				>The order matters: put the column you filter on most first.</Form.Description
			>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.unique} orientation="horizontal">
			<Form.Checkbox defaultChecked={index?.unique} />
			<Form.Label>Unique</Form.Label>
			<Form.Description class="w-full pl-6">
				No two records can have the same combination of values.
			</Form.Description>
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>{index ? 'Save' : 'Add index'}</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
