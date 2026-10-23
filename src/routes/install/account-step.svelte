<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { accountSchema } from '#lib/schemas/install.js';
	import { createAccount } from './install.remote';

	const form = createAccount.preflight(accountSchema);
</script>

<Card.Header>
	<Card.Title>Create account</Card.Title>
	<Card.Description>
		You'll use this account to log in to Pouchbase. This step also creates the databases.
	</Card.Description>
</Card.Header>

<Card.Content>
	<Form.Root {form} oninput={() => form.validate()}>
		<Form.Field field={form.fields.email}>
			<Form.Label>Email address</Form.Label>
			<Form.Input type="email" autocomplete="username" />
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

		<Form.Submit>{form.pending ? 'Installing…' : 'Create account'}</Form.Submit>
	</Form.Root>
</Card.Content>
