<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { passwordProviderSchema } from '#lib/schemas/password-auth.js';
	import { updatePasswordProvider } from './auth-settings.remote';

	type Props = {
		settings: { signUp: boolean };
	} & DialogProps;

	let { settings, close }: Props = $props();

	const form = updatePasswordProvider.preflight(passwordProviderSchema);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title class="flex items-center gap-2">
			<Icon.Root icon="lucide:key-round" class="size-5" />
			Username & password
		</Dialog.Title>
		<Dialog.Description>
			Users sign in with the <span class="font-mono">username</span> of their record in
			<span class="font-mono">users</span> and a password. You can set a user's password in the
			<span class="font-mono">users</span> collection.
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
		<Form.Field field={form.fields.enabled} orientation="horizontal">
			<!-- Setting the provider up usually means switching it on. -->
			<Form.Checkbox defaultChecked />
			<Form.Label>Active</Form.Label>
			<Form.Description class="w-full pl-6">
				Users can sign in with their username and password.
			</Form.Description>
		</Form.Field>

		<Form.Field field={form.fields.signUp} orientation="horizontal">
			<Form.Checkbox defaultChecked={settings.signUp} />
			<Form.Label>Allow sign-up</Form.Label>
			<Form.Description class="w-full pl-6">
				New users can create an account themselves. Otherwise only you create users.
			</Form.Description>
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Save</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
