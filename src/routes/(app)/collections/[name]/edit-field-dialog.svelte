<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { FIELD_TYPES } from '#lib/fields/field-types.js';
	import { updateFieldSchema } from '#lib/schemas/fields.js';
	import FieldSettings from './field-settings.svelte';
	import { updateField } from './fields.remote';
	import type { GridField } from './grid';

	type Props = {
		collection: { name: string };
		/** The field to change. */
		field: GridField;
	} & DialogProps;

	let { collection, field, close }: Props = $props();

	const form = $derived(updateField.for(field.id).preflight(updateFieldSchema));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Edit field</Dialog.Title>
		<Dialog.Description>
			Changes the settings of <span class="font-mono">{field.name}</span>
			({FIELD_TYPES[field.type].label}). Saved right away; records keep their values.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Field saved"
		oninput={() => form.validate()}
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.collection} value={collection.name} />
		<Form.Hidden field={form.fields.name} value={field.name} />
		<Form.Hidden field={form.fields.type} value={field.type} />

		<FieldSettings type={field.type} formFields={form.fields} {field} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Save</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
