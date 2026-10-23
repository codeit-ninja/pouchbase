<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { backupDestinationSchema } from '#lib/schemas/backups.js';
	import { saveBackupDestination } from './backups.remote';
	import type { Destination } from './types';

	type Props = {
		/** Omitted for a new destination. */
		destination?: Destination;
	} & DialogProps;

	let { destination, close }: Props = $props();

	const form = $derived(
		saveBackupDestination.for(destination?.id ?? 'new').preflight(backupDestinationSchema)
	);
</script>

<Dialog.Content size="md">
	<Dialog.Header>
		<Dialog.Title>{destination ? `Edit ${destination.name}` : 'Add destination'}</Dialog.Title>
		<Dialog.Description>
			An S3-compatible bucket for backups, such as Amazon S3, Cloudflare R2, Backblaze B2 or MinIO.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Destination saved"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={destination?.id ?? ''} />

		<Form.Field field={form.fields.name}>
			<Form.Label>Name</Form.Label>
			<Form.Input
				defaultValue={destination?.name}
				placeholder="Offsite backups"
				autocomplete="off"
			/>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.endpoint}>
			<Form.Label>Endpoint</Form.Label>
			<Form.Input
				type="url"
				defaultValue={destination?.endpoint}
				placeholder="https://s3.eu-central-1.amazonaws.com"
				autocomplete="off"
			/>
			<Form.Errors />
		</Form.Field>

		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field field={form.fields.bucket}>
				<Form.Label>Bucket</Form.Label>
				<Form.Input defaultValue={destination?.bucket} autocomplete="off" />
				<Form.Errors />
			</Form.Field>

			<Form.Field field={form.fields.region}>
				<Form.Label>Region</Form.Label>
				<Form.Input
					defaultValue={destination?.region ?? 'us-east-1'}
					placeholder="us-east-1"
					autocomplete="off"
				/>
				<Form.Errors />
			</Form.Field>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field field={form.fields.accessKeyId}>
				<Form.Label>Access key ID</Form.Label>
				<Form.Input defaultValue={destination?.accessKeyId} autocomplete="off" />
				<Form.Errors />
			</Form.Field>

			<Form.Field field={form.fields._secretAccessKey}>
				<Form.Label>Secret access key</Form.Label>
				<Form.Input
					type="password"
					autocomplete="new-password"
					placeholder={destination?.hasSecretAccessKey ? 'Stored — leave empty to keep it' : ''}
				/>
				<Form.Errors />
			</Form.Field>
		</div>

		<Form.Field field={form.fields.prefix}>
			<Form.Label>Folder</Form.Label>
			<Form.Input defaultValue={destination?.prefix ?? 'pouchbase'} autocomplete="off" />
			<Form.Description>Backups are stored in this folder of the bucket.</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.pathStyle} orientation="horizontal">
			<Form.Checkbox defaultChecked={destination?.pathStyle ?? false} />
			<Form.Label>Use path-style URLs</Form.Label>
			<Form.Description class="w-full pl-6">
				Needed by some providers, such as MinIO: <code>https://host/bucket/file</code>
				instead of <code>https://bucket.host/file</code>.
			</Form.Description>
		</Form.Field>

		<Callout.Root>
			<Callout.Icon><Icon.Root icon="lucide:info" /></Callout.Icon>
			<Callout.Body>
				<Callout.Description>
					The bucket must already exist. When you save, a test file is written to it and deleted
					again, so the key needs permission to read, write, list and delete objects.
				</Callout.Description>
			</Callout.Body>
		</Callout.Root>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Save</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
