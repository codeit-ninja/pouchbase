<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteBackupDestination } from './backups.remote';
	import type { Destination } from './types';

	type Props = { destination: Destination } & DialogProps;

	let { destination, close }: Props = $props();

	const form = $derived(deleteBackupDestination.for(destination.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete destination</Dialog.Title>
		<Dialog.Description>
			Pouchbase forgets <strong class="font-medium text-zinc-900">{destination.name}</strong>, its
			schedules and its list of backups. The backups stay in the bucket: add the destination again
			and use Find backups to list them.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Destination deleted"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={destination.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete destination</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
