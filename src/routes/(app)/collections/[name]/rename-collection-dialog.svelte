<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { renameCollectionSchema } from '#lib/schemas/collections.js';
	import { renameCollection } from '../../collections.remote';

	type Props = {
		collection: { id: string; name: string };
	} & DialogProps;

	let { collection, close }: Props = $props();

	// One form instance per collection, so state doesn't leak between collections.
	const form = $derived(renameCollection.for(collection.id).preflight(renameCollectionSchema));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Rename collection</Dialog.Title>
		<Dialog.Description>
			The table in your app database is renamed too. Records are kept.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Collection renamed"
		enhance={async (instance) => {
			if (await instance.submit()) {
				const name = instance.result?.name;

				close();

				if (name) {
					await goto(resolve('/(app)/collections/[name]', { name }), { replace: true });
				}
			}
		}}
	>
		<Form.Hidden field={form.fields.name} value={collection.name} />

		<Form.Field field={form.fields.newName}>
			<Form.Label>Name</Form.Label>
			<Form.Input defaultValue={collection.name} autocomplete="off" />
			<Form.Description>Lowercase letters, numbers and underscores.</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Rename</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
