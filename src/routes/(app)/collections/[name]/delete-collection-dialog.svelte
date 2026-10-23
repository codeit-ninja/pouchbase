<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteCollection } from '../../collections.remote';

	type Props = {
		collection: { id: string; name: string };
	} & DialogProps;

	let { collection }: Props = $props();

	const form = $derived(deleteCollection.for(collection.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete collection</Dialog.Title>
		<Dialog.Description>
			This permanently deletes the collection
			<strong class="font-medium text-zinc-900">{collection.name}</strong> and all of its records. This
			can't be undone.
		</Dialog.Description>
	</Dialog.Header>

	<!-- The server redirects to the overview after deleting. -->
	<Form.Root {form} success="Collection deleted">
		<Form.Hidden field={form.fields.name} value={collection.name} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete collection</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
