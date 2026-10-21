<script lang="ts">
	import { page } from '$app/state';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Copy from '#lib/components/ui/inputs/copy/index.js';
	import {
		OAUTH_PROVIDERS,
		oauthCallbackPath,
		type OAuthProvider
	} from '#lib/auth/oauth-providers.js';
	import { oauthProviderSchema } from '#lib/schemas/settings.js';
	import { updateOAuthProvider } from './auth-settings.remote';

	type Props = {
		provider: {
			provider: OAuthProvider;
			enabled: boolean;
			clientId: string;
			hasSecret: boolean;
		};
	} & DialogProps;

	let { provider, close }: Props = $props();

	const info = $derived(OAUTH_PROVIDERS[provider.provider]);
	const form = $derived(updateOAuthProvider.for(provider.provider).preflight(oauthProviderSchema));
	// Same URL the OAuth endpoints send to the provider (`AuthService.callbackUrl`).
	const callbackUrl = $derived(
		new URL(oauthCallbackPath(provider.provider), page.url.origin).toString()
	);
	const callbackId = $props.id();
</script>

<Dialog.Content class="max-w-lg">
	<Dialog.Header>
		<Dialog.Title class="flex items-center gap-2">
			<Icon.Root icon={info.icon} class="size-5" />
			{provider.enabled ? `Configure ${info.label}` : `Set up ${info.label}`}
		</Dialog.Title>
		<Dialog.Description>
			Create an OAuth app in the {info.label} developer console, register the callback URL below and paste
			its client ID and secret here.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.provider} value={provider.provider} />

		<div class="flex flex-col gap-1.5">
			<label for={callbackId} class="text-sm font-medium text-zinc-900">Callback URL</label>
			<Copy.Root id={callbackId} value={callbackUrl} label="Copy callback URL" />
		</div>

		<Form.Field field={form.fields.clientId}>
			<Form.Label>Client ID</Form.Label>
			<Form.Input defaultValue={provider.clientId} autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields._clientSecret}>
			<Form.Label>Client secret</Form.Label>
			<Form.Input
				type="password"
				autocomplete="new-password"
				placeholder={provider.hasSecret ? 'Stored — leave empty to keep it' : ''}
			/>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.enabled} orientation="horizontal">
			<!-- Setting a provider up usually means switching it on. -->
			<Form.Checkbox defaultChecked />
			<Form.Label>Active</Form.Label>
			<Form.Description class="w-full pl-6">
				Users can sign in and sign up with {info.label}.
			</Form.Description>
			<Form.Errors class="w-full pl-6" />
		</Form.Field>

		<Dialog.Footer class="sm:justify-between">
			<Button.Root
				href={info.consoleUrl}
				target="_blank"
				rel="noreferrer"
				variant="ghost"
				class="sm:-ml-4"
			>
				<Icon.Root icon="lucide:external-link" />
				Developer console
			</Button.Root>

			<div class="flex flex-col-reverse gap-2 sm:flex-row">
				<Dialog.Close>Cancel</Dialog.Close>
				<Form.Submit>Save</Form.Submit>
			</div>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
