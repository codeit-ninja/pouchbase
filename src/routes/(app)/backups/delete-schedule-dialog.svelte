<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { describeCron } from '#lib/backups/cron.js';
	import { deleteBackupSchedule } from './backups.remote';
	import type { Schedule } from './types';

	type Props = { schedule: Schedule } & DialogProps;

	let { schedule, close }: Props = $props();

	const form = $derived(deleteBackupSchedule.for(schedule.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete schedule</Dialog.Title>
		<Dialog.Description>
			The backups to {schedule.destinationName} ({describeCron(schedule.cron).toLowerCase()}) stop.
			The backups it made are kept.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Schedule deleted"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={schedule.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete schedule</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
