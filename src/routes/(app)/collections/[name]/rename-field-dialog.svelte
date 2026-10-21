<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { renameFieldSchema } from '#lib/schemas/fields.js';
	import { renameField } from './fields.remote';

	type Props = {
		collection: { name: string };
		field: { id: string; name: string };
	} & DialogProps;

	let { collection, field, close }: Props = $props();

	const form = $derived(renameField.for(field.id).preflight(renameFieldSchema));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Rename field</Dialog.Title>
		<Dialog.Description>The column is renamed too. Its data is kept.</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.collection} value={collection.name} />
		<Form.Hidden field={form.fields.name} value={field.name} />

		<Form.Field field={form.fields.newName}>
			<Form.Label>Name</Form.Label>
			<Form.Input defaultValue={field.name} autocomplete="off" />
			<Form.Description>Lowercase letters, numbers and underscores.</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Rename</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
