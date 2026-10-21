<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { createCollectionSchema } from '#lib/schemas/collections.js';
	import { createCollection } from './collections.remote';

	let { close }: DialogProps = $props();

	const form = createCollection.preflight(createCollectionSchema);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>New collection</Dialog.Title>
		<Dialog.Description>
			A collection is a table in your app database. You can add fields after creating it.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		enhance={async (instance) => {
			if (await instance.submit()) {
				const name = instance.result?.name;

				instance.element.reset();
				close();

				if (name) {
					await goto(resolve('/(app)/collections/[name]', { name }));
				}
			}
		}}
	>
		<Form.Field field={form.fields.name}>
			<Form.Label>Name</Form.Label>
			<Form.Input placeholder="posts" autocomplete="off" />
			<Form.Description>
				Lowercase letters, numbers and underscores. Used as the table name.
			</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Create collection</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
