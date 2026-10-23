<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { createAdminSchema } from '#lib/schemas/admins.js';
	import { createAdmin } from './admins.remote';

	let { close }: DialogProps = $props();

	const form = createAdmin.preflight(createAdminSchema);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>New admin</Dialog.Title>
		<Dialog.Description>
			Admins can log in to Pouchbase and manage collections, records and settings.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Admin created"
		enhance={async (instance) => {
			if (await instance.submit()) {
				instance.element.reset();
				close();
			}
		}}
	>
		<Form.Field field={form.fields.username}>
			<Form.Label>Username</Form.Label>
			<Form.Input autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.email}>
			<Form.Label>Email address</Form.Label>
			<Form.Input type="email" autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields._password}>
			<Form.Label>Password</Form.Label>
			<Form.Input type="password" autocomplete="new-password" />
			<Form.Description>At least 10 characters.</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields._passwordConfirm}>
			<Form.Label>Confirm password</Form.Label>
			<Form.Input type="password" autocomplete="new-password" />
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Create admin</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
