<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { updateComputedSchema } from '#lib/schemas/fields.js';
	import ComputeOptions from './compute-options.svelte';
	import { updateComputedField } from './fields.remote';
	import type { GridField } from './grid';

	type Props = {
		collection: { name: string };
		/** The computed field to change. */
		field: GridField;
		/** Every field of the collection, to choose a source from. */
		fields: GridField[];
	} & DialogProps;

	let { collection, field, fields, close }: Props = $props();

	const form = $derived(updateComputedField.for(field.id).preflight(updateComputedSchema));
</script>

<Dialog.Content size="lg">
	<Dialog.Header>
		<Dialog.Title>Edit computation</Dialog.Title>
		<Dialog.Description>
			Changes how <span class="font-mono">{field.name}</span> is calculated. Every record is recalculated
			when you save; if one fails, nothing changes.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Computed field saved"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.collection} value={collection.name} />
		<Form.Hidden field={form.fields.name} value={field.name} />

		<ComputeOptions
			{collection}
			{fields}
			{field}
			formFields={form.fields}
			initial={{
				transform: field.options.transform,
				source: field.options.source,
				script: field.options.script
			}}
		/>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Save and recalculate</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
