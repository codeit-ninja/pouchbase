<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { restoreBackupSchema } from '#lib/schemas/backups.js';
	import { restoreBackup } from './backups.remote';
	import type { Backup } from './types';

	type Props = {
		backup: Backup;
		/** When the backup was made, e.g. `Oct 23, 2026, 3:00 AM`. */
		label: string;
	} & DialogProps<boolean>;

	let { backup, label, close }: Props = $props();

	const form = $derived(restoreBackup.for(backup.id).preflight(restoreBackupSchema));
</script>

<Dialog.Content size="md">
	<Dialog.Header>
		<Dialog.Title>Restore backup</Dialog.Title>
		<Dialog.Description>
			Replaces all data with the backup of
			<strong class="font-medium text-zinc-900">{label}</strong>: collections, records, admins and
			settings. Backups, schedules and destinations stay as they are now.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Restore started"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close(true);
			}
		}}
	>
		<Form.Hidden field={form.fields.backupId} value={backup.id} />

		<Callout.Root variant="warning">
			<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
			<Callout.Body>
				<Callout.Description>
					Everything that changed since the backup is lost, so consider backing up first. Your app
					keeps working while the backup is loaded, and is unavailable for a moment when it switches
					over. Admins that don't exist in the backup are logged out.
				</Callout.Description>
			</Callout.Body>
		</Callout.Root>

		{#if backup.includeFiles}
			<Form.Field field={form.fields.includeFiles} orientation="horizontal">
				<Form.Checkbox defaultChecked />
				<Form.Label>Restore files</Form.Label>
				<Form.Description class="w-full pl-6">
					Copies the files of the backup back to the storage, replacing files with the same key.
				</Form.Description>
			</Form.Field>
		{:else}
			<Form.Hidden field={form.fields.includeFiles} value={false} />
		{/if}

		<Form.Field field={form.fields.confirm}>
			<Form.Label>Type <span class="font-mono">restore</span> to confirm</Form.Label>
			<Form.Input autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Restore backup</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
