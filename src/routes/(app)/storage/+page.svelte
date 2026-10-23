<script lang="ts">
	import { untrack } from 'svelte';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getAppName } from '#lib/remote/settings.remote.js';
	import { storageSettingsSchema } from '#lib/schemas/storage.js';
	import StorageMigration from './storage-migration.svelte';
	import { getStorageMigration, getStorageSettings, updateStorageSettings } from './storage.remote';

	const [appName, settings, migration] = $derived(
		await Promise.all([getAppName(), getStorageSettings(), getStorageMigration()])
	);

	// Shows the fields of the chosen provider before the settings are saved.
	let provider = $state(untrack(() => settings.provider));

	const storageForm = updateStorageSettings.preflight(storageSettingsSchema);

	const providers = [
		{
			value: 'r2',
			label: 'Cloudflare R2',
			description: 'A bucket on the Cloudflare account of this app',
			icon: 'lucide:cloud'
		},
		{
			value: 's3',
			label: 'S3-compatible storage',
			description: 'Amazon S3, Backblaze B2, MinIO, …',
			icon: 'lucide:server'
		}
	];
</script>

<svelte:head>
	<title>Storage · {appName}</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Storage</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Storage</Page.Title>
			</div>
		</Page.Header>

		<Card.Root>
			<Card.Header>
				<Card.Title>File storage</Card.Title>
				<Card.Description>Where the files uploaded to your app are stored.</Card.Description>
			</Card.Header>

			<Card.Content>
				<!-- Not reset after saving: the fields keep showing what was saved. -->
				<Form.Root
					form={storageForm}
					success="Storage settings saved"
					enhance={async (instance) => {
						await instance.submit();
					}}
				>
					<Form.Field field={storageForm.fields.provider}>
						<Form.Label>Store files in</Form.Label>
						<Form.Select
							items={providers}
							defaultValue={settings.provider}
							onValueChange={(next) => (provider = next as typeof provider)}
						/>
						<Form.Errors />
					</Form.Field>

					{#if provider !== settings.provider && migration}
						<Callout.Root variant="warning">
							<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
							<Callout.Body>
								<Callout.Description>
									Files are still being moved to the current storage. Finish or skip that first.
								</Callout.Description>
							</Callout.Body>
						</Callout.Root>
					{:else if provider !== settings.provider}
						<Callout.Root>
							<Callout.Icon><Icon.Root icon="lucide:info" /></Callout.Icon>
							<Callout.Body>
								<Callout.Description>
									New uploads go to the new storage right after saving. Existing files are read from
									the current storage until you move them with Move files.
								</Callout.Description>
							</Callout.Body>
						</Callout.Root>
					{/if}

					<!-- Hidden rather than removed, so the stored values are submitted unchanged. -->
					<div class="flex flex-col gap-4" hidden={provider !== 's3'}>
						<Form.Field field={storageForm.fields.endpoint}>
							<Form.Label>Endpoint</Form.Label>
							<Form.Input
								type="url"
								defaultValue={settings.endpoint}
								placeholder="https://s3.eu-central-1.amazonaws.com"
								autocomplete="off"
							/>
							<Form.Errors />
						</Form.Field>

						<div class="grid gap-4 sm:grid-cols-2">
							<Form.Field field={storageForm.fields.bucket}>
								<Form.Label>Bucket</Form.Label>
								<Form.Input defaultValue={settings.bucket} autocomplete="off" />
								<Form.Errors />
							</Form.Field>

							<Form.Field field={storageForm.fields.region}>
								<Form.Label>Region</Form.Label>
								<Form.Input
									defaultValue={settings.region || 'us-east-1'}
									placeholder="us-east-1"
									autocomplete="off"
								/>
								<Form.Errors />
							</Form.Field>
						</div>

						<div class="grid gap-4 sm:grid-cols-2">
							<Form.Field field={storageForm.fields.accessKeyId}>
								<Form.Label>Access key ID</Form.Label>
								<Form.Input defaultValue={settings.accessKeyId} autocomplete="off" />
								<Form.Errors />
							</Form.Field>

							<Form.Field field={storageForm.fields._secretAccessKey}>
								<Form.Label>Secret access key</Form.Label>
								<Form.Input
									type="password"
									autocomplete="new-password"
									placeholder={settings.hasSecretAccessKey ? 'Stored — leave empty to keep it' : ''}
								/>
								<Form.Errors />
							</Form.Field>
						</div>

						<Form.Field field={storageForm.fields.pathStyle} orientation="horizontal">
							<Form.Checkbox defaultChecked={settings.pathStyle} />
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
									The bucket must already exist. When you save, a test file is written to it and
									deleted again, so the key needs permission to read, write and delete objects.
								</Callout.Description>
							</Callout.Body>
						</Callout.Root>
					</div>

					<div class="flex justify-end">
						<Form.Submit>Save</Form.Submit>
					</div>
				</Form.Root>
			</Card.Content>
		</Card.Root>

		<StorageMigration />
	</div>
</Page.Root>
