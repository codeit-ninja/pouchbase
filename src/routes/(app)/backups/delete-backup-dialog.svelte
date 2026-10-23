<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteBackup } from './backups.remote';
	import type { Backup } from './types';

	type Props = {
		backup: Backup;
		/** When the backup was made, e.g. `Oct 23, 2026, 3:00 AM`. */
		label: string;
	} & DialogProps;

	let { backup, label, close }: Props = $props();

	const form = $derived(deleteBackup.for(backup.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete backup</Dialog.Title>
		<Dialog.Description>
			This permanently deletes the backup of
			<strong class="font-medium text-zinc-900">{label}</strong> from {backup.destinationName}.
			Copies of files stay, because other backups share them. This can't be undone.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Backup deleted"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={backup.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete backup</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
