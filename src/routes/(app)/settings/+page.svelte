<script lang="ts">
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getAppName } from '#lib/remote/settings.remote.js';
	import { generalSettingsSchema } from '#lib/schemas/settings.js';
	import { updateGeneralSettings } from './settings.remote';

	const appName = $derived(await getAppName());

	const generalForm = updateGeneralSettings.preflight(generalSettingsSchema);
</script>

<svelte:head>
	<title>Settings · {appName}</title>
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
				<Form.Root form={generalForm}>
					<Form.Field field={generalForm.fields.appName}>
						<Form.Label>App name</Form.Label>
						<Form.Input defaultValue={appName} autocomplete="off" />
						<Form.Errors />
					</Form.Field>

					<div class="flex justify-end">
						<Form.Submit>Save</Form.Submit>
					</div>
				</Form.Root>
			</Card.Content>
		</Card.Root>
	</div>
</Page.Root>
