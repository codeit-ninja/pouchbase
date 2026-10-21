<script lang="ts">
	import type { FieldType, RichTextFormat } from '#lib/fields/field-types.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { FIELD_TYPE_IDS, FIELD_TYPES } from '#lib/fields/field-types.js';
	import { createFieldSchema } from '#lib/schemas/fields.js';
	import { listCollections } from '../../collections.remote';
	import { createField } from './fields.remote';

	type Props = {
		collection: { id: string; name: string };
	} & DialogProps;

	let { collection, close }: Props = $props();

	const form = $derived(createField.for(collection.id).preflight(createFieldSchema));

	// `value()` stays undefined until the control is changed, so fall back to the initial values.
	const type = $derived((form.fields.type.value() as FieldType | undefined) ?? 'text');
	const format = $derived((form.fields.format.value() as RichTextFormat | undefined) ?? 'html');

	const collectionItems = $derived(
		(await listCollections()).map((item) => ({
			value: item.id,
			label: item.name,
			description: item.id === collection.id ? 'This collection' : undefined
		}))
	);

	const typeItems = FIELD_TYPE_IDS.map((id) => ({
		value: id,
		label: FIELD_TYPES[id].label,
		description: FIELD_TYPES[id].description,
		icon: FIELD_TYPES[id].icon
	}));

	const formatItems = [
		{ value: 'html', label: 'HTML', description: 'Stored as HTML markup.' },
		{ value: 'markdown', label: 'Markdown', description: 'Stored as Markdown text.' }
	];

	const booleanItems = [
		{ value: '', label: 'None' },
		{ value: 'true', label: 'True' },
		{ value: 'false', label: 'False' }
	];

	const defaultPlaceholders: Partial<Record<FieldType, string>> = {
		number: '0.5',
		integer: '0',
		date: '2026-01-31',
		email: 'name@example.com',
		url: 'https://example.com',
		json: '{"key": "value"}'
	};
</script>

<Dialog.Content class="max-w-lg">
	<Dialog.Header>
		<Dialog.Title>Add field</Dialog.Title>
		<Dialog.Description>
			Adds a column to <span class="font-mono">{collection.name}</span>.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
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

		{#if type === 'rich_text'}
			<Form.Field field={form.fields.format}>
				<Form.Label>Store as</Form.Label>
				<Form.Select items={formatItems} defaultValue="html" />
				<Form.Errors />
			</Form.Field>
		{/if}

		{#if type === 'relation'}
			<Form.Field field={form.fields.relationCollection}>
				<Form.Label>Related collection</Form.Label>
				<Form.Select items={collectionItems} placeholder="Choose a collection…" />
				<Form.Description>Records of this collection can be linked.</Form.Description>
				<Form.Errors />
			</Form.Field>

			<Form.Field field={form.fields.multiple} orientation="horizontal">
				<Form.Checkbox />
				<Form.Label>Allow multiple</Form.Label>
				<Form.Description class="w-full pl-6">
					Link several records instead of one; stored as a JSON array of ids.
				</Form.Description>
			</Form.Field>
		{/if}

		{#if FIELD_TYPES[type].defaultable}
			<Form.Field field={form.fields.defaultValue}>
				<Form.Label>Default value</Form.Label>

				{#if type === 'rich_text'}
					{#key format}
						<Form.RichText {format} placeholder="Optional" />
					{/key}
				{:else if type === 'boolean'}
					<Form.Select items={booleanItems} defaultValue="" />
				{:else}
					<Form.Input placeholder={defaultPlaceholders[type] ?? 'Optional'} autocomplete="off" />
				{/if}

				<Form.Description>Used when a record doesn't set this field.</Form.Description>
				<Form.Errors />
			</Form.Field>
		{/if}

		<div class="flex flex-col gap-3">
			<Form.Field field={form.fields.required} orientation="horizontal">
				<Form.Checkbox />
				<Form.Label>Required</Form.Label>
				<Form.Description class="w-full pl-6">Records must have a value.</Form.Description>
			</Form.Field>

			{#if type !== 'relation'}
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
