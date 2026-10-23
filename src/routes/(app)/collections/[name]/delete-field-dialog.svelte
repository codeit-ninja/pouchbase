<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteField } from './fields.remote';

	type Props = {
		collection: { name: string };
		field: { id: string; name: string };
	} & DialogProps;

	let { collection, field, close }: Props = $props();

	const form = $derived(deleteField.for(field.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete field</Dialog.Title>
		<Dialog.Description>
			This permanently deletes the field
			<strong class="font-medium text-zinc-900">{field.name}</strong> and its value in every record. This
			can't be undone.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Field deleted"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.collection} value={collection.name} />
		<Form.Hidden field={form.fields.name} value={field.name} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete field</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
