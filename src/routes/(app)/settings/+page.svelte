<script lang="ts">
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getEnvironment } from '#lib/remote/settings.remote.js';
	import { generalSettingsSchema } from '#lib/schemas/settings.js';
	import MailSettings from './mail-settings.svelte';
	import { updateGeneralSettings } from './settings.remote';

	const environment = $derived(await getEnvironment());

	const environments = [
		{ value: 'none', label: 'Not set' },
		{ value: 'development', label: 'Development', icon: 'lucide:flask-conical' },
		{ value: 'production', label: 'Production', icon: 'lucide:rocket' }
	];

	const generalForm = updateGeneralSettings.preflight(generalSettingsSchema);
</script>

<svelte:head>
	<title>Settings · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Settings</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>General</Page.Title>
			</div>
		</Page.Header>

		<Card.Root>
			<Card.Content>
				<Form.Root form={generalForm} success="Settings saved">
					<Form.Field field={generalForm.fields.environment}>
						<Form.Label>Environment</Form.Label>
						<Form.Select items={environments} defaultValue={environment ?? 'none'} />
						<Form.Description>
							Shown in the sidebar, so you always know which instance you are working on.
						</Form.Description>
						<Form.Errors />
					</Form.Field>

					<div class="flex justify-end">
						<Form.Submit>Save</Form.Submit>
					</div>
				</Form.Root>
			</Card.Content>
		</Card.Root>

		<MailSettings />
	</div>
</Page.Root>
