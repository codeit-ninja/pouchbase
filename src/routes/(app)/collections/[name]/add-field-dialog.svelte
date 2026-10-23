<script lang="ts">
	import type { FieldType } from '#lib/fields/field-types.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { FIELD_TYPE_IDS, FIELD_TYPES, isAutoType } from '#lib/fields/field-types.js';
	import { createFieldSchema } from '#lib/schemas/fields.js';
	import { listCollections } from '../../collections.remote';
	import ComputeOptions from './compute-options.svelte';
	import FieldSettings from './field-settings.svelte';
	import { createField } from './fields.remote';
	import type { GridField } from './grid';

	type Props = {
		collection: { id: string; name: string };
		/** Existing fields of the collection; a computed field is calculated from one of them. */
		fields?: GridField[];
	} & DialogProps;

	let { collection, fields = [], close }: Props = $props();

	const form = $derived(createField.for(collection.id).preflight(createFieldSchema));

	// `value()` stays undefined until the control is changed, so fall back to the initial values.
	const type = $derived((form.fields.type.value() as FieldType | undefined) ?? 'text');
	const multiple = $derived(!!form.fields.multiple.value());

	// Not awaited, so it never holds back opening the dialog (the sidebar has usually loaded it).
	const collectionItems = $derived(
		(listCollections().current ?? []).map((item) => ({
			value: item.id,
			label: item.name,
			description: item.id === collection.id ? 'This collection' : undefined
		}))
	);

	// A collection has at most one id field: its primary key.
	const typeItems = $derived(
		FIELD_TYPE_IDS.filter((id) => id !== 'id' || !fields.some((field) => field.type === 'id')).map(
			(id) => ({
				value: id,
				label: FIELD_TYPES[id].label,
				description: FIELD_TYPES[id].description,
				icon: FIELD_TYPES[id].icon
			})
		)
	);
</script>

<Dialog.Content size={type === 'computed' ? 'lg' : 'md'}>
	<Dialog.Header>
		<Dialog.Title>Add field</Dialog.Title>
		<Dialog.Description>
			Adds a column to <span class="font-mono">{collection.name}</span>.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Field added"
		oninput={() => form.validate()}
		enhance={async (instance) => {
			if (await instance.submit()) {
				instance.element.reset();
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.collection} value={collection.name} />

		<Form.Field field={form.fields.name}>
			<Form.Label>Name</Form.Label>
			<Form.Input placeholder="title" autocomplete="off" />
			<Form.Description>Lowercase letters, numbers and underscores.</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.type}>
			<Form.Label>Type</Form.Label>
			<Form.Select items={typeItems} defaultValue="text" />
			<Form.Errors />
		</Form.Field>

		{#if type === 'relation'}
			<Form.Field field={form.fields.relationCollection}>
				<Form.Label>Related collection</Form.Label>
				<Form.Select items={collectionItems} placeholder="Choose a collection…" />
				<Form.Description>Records of this collection can be linked.</Form.Description>
				<Form.Errors />
			</Form.Field>
		{/if}

		<FieldSettings {type} formFields={form.fields} />

		{#if type === 'computed'}
			<ComputeOptions {collection} {fields} formFields={form.fields} />
		{/if}

		<div class="flex flex-col gap-3">
			{#if type !== 'computed' && !isAutoType(type)}
				<Form.Field field={form.fields.required} orientation="horizontal">
					<Form.Checkbox />
					<Form.Label>Required</Form.Label>
					<Form.Description class="w-full pl-6">Records must have a value.</Form.Description>
				</Form.Field>
			{/if}

			{#if type !== 'relation' && type !== 'file' && !isAutoType(type) && !(type === 'list' && multiple)}
				<Form.Field field={form.fields.unique} orientation="horizontal">
					<Form.Checkbox />
					<Form.Label>Unique</Form.Label>
					<Form.Description class="w-full pl-6">
						No two records can have the same value.
					</Form.Description>
				</Form.Field>
			{/if}
		</div>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Add field</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
