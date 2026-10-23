<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { CRON_PRESETS } from '#lib/backups/cron.js';
	import { backupScheduleSchema, SCHEDULE_FREQUENCIES } from '#lib/schemas/backups.js';
	import { saveBackupSchedule } from './backups.remote';
	import type { Destination, Schedule } from './types';

	type Props = {
		destinations: Destination[];
		/** Omitted for a new schedule. */
		schedule?: Schedule;
	} & DialogProps;

	let { destinations, schedule, close }: Props = $props();

	const form = $derived(
		saveBackupSchedule.for(schedule?.id ?? 'new').preflight(backupScheduleSchema)
	);

	const initialFrequency = untrack(() => {
		if (!schedule) {
			return CRON_PRESETS[2].value;
		}

		return SCHEDULE_FREQUENCIES.includes(schedule.cron) ? schedule.cron : 'custom';
	});

	// Shows the cron field before the schedule is saved.
	let frequency = $state(initialFrequency);

	const destinationItems = $derived(
		destinations.map((destination) => ({
			value: destination.id,
			label: destination.name,
			description: destination.bucket
		}))
	);

	const frequencyItems = [
		...CRON_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
		{ value: 'custom', label: 'Custom', description: 'A cron expression' }
	];
</script>

<Dialog.Content size="md">
	<Dialog.Header>
		<Dialog.Title>{schedule ? 'Edit schedule' : 'New schedule'}</Dialog.Title>
		<Dialog.Description>
			Backs up the databases on a schedule. Times are in UTC; a backup starts within a minute of its
			time.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Schedule saved"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={schedule?.id ?? ''} />

		<Form.Field field={form.fields.destinationId}>
			<Form.Label>Destination</Form.Label>
			<Form.Select
				items={destinationItems}
				defaultValue={schedule?.destinationId ?? destinations[0]?.id}
			/>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.frequency}>
			<Form.Label>How often</Form.Label>
			<Form.Select
				items={frequencyItems}
				defaultValue={initialFrequency}
				onValueChange={(next) => (frequency = next)}
			/>
			<Form.Errors />
		</Form.Field>

		<!-- Hidden rather than removed, so a stored expression is submitted unchanged. -->
		<div class="flex flex-col gap-4" hidden={frequency !== 'custom'}>
			<Form.Field field={form.fields.cron}>
				<Form.Label>Cron expression</Form.Label>
				<Form.Input
					defaultValue={initialFrequency === 'custom' ? schedule?.cron : ''}
					placeholder="30 2 * * 1-5"
					autocomplete="off"
					class="font-mono"
				/>
				<Form.Description>
					Minute, hour, day of the month, month and day of the week, in UTC.
				</Form.Description>
				<Form.Errors />
			</Form.Field>
		</div>

		<Form.Field field={form.fields.keep}>
			<Form.Label>Backups to keep</Form.Label>
			<Form.Input type="number" min="0" max="1000" defaultValue={String(schedule?.keep ?? 7)} />
			<Form.Description>Older backups of this schedule are deleted. 0 keeps all.</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.includeFiles} orientation="horizontal">
			<Form.Checkbox defaultChecked={schedule?.includeFiles ?? false} />
			<Form.Label>Include files</Form.Label>
			<Form.Description class="w-full pl-6">
				Also copies uploaded files. Files that are already in the destination aren't copied again.
			</Form.Description>
		</Form.Field>

		<Form.Field field={form.fields.enabled} orientation="horizontal">
			<Form.Checkbox defaultChecked={schedule?.enabled ?? true} />
			<Form.Label>Active</Form.Label>
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Save</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
