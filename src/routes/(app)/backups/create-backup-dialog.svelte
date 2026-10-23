<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { createBackupSchema } from '#lib/schemas/backups.js';
	import { startBackup } from './backups.remote';
	import type { Destination } from './types';

	type Props = { destinations: Destination[] } & DialogProps<boolean>;

	let { destinations, close }: Props = $props();

	const form = startBackup.preflight(createBackupSchema);

	const items = $derived(
		destinations.map((destination) => ({
			value: destination.id,
			label: destination.name,
			description: destination.bucket
		}))
	);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Back up now</Dialog.Title>
		<Dialog.Description>
			Copies the system and app databases to the destination. The backup continues in the background
			when you leave this page.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Backup started"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close(true);
			}
		}}
	>
		<Form.Field field={form.fields.destinationId}>
			<Form.Label>Destination</Form.Label>
			<Form.Select {items} defaultValue={destinations[0]?.id} />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.includeFiles} orientation="horizontal">
			<Form.Checkbox />
			<Form.Label>Include files</Form.Label>
			<Form.Description class="w-full pl-6">
				Also copies uploaded files. Files that are already in the destination aren't copied again.
			</Form.Description>
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Start backup</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
