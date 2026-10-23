<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { loginSchema } from '#lib/schemas/auth.js';
	import { login } from '../auth.remote';

	const form = login.preflight(loginSchema);
</script>

<svelte:head>
	<title>Log in · Pouchbase</title>
</svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-4 py-12">
	<Card.Root>
		<Card.Header>
			<Card.Title>Log in</Card.Title>
			<Card.Description>Log in with your email address and password.</Card.Description>
		</Card.Header>

		<Card.Content>
			<Form.Root {form}>
				<Form.Field field={form.fields.email}>
					<Form.Label>Email address</Form.Label>
					<Form.Input type="email" autocomplete="username" />
					<Form.Errors />
				</Form.Field>

				<Form.Field field={form.fields._password}>
					<Form.Label>Password</Form.Label>
					<Form.Input type="password" autocomplete="current-password" />
					<Form.Errors />
				</Form.Field>

				<Form.Submit>Log in</Form.Submit>
			</Form.Root>
		</Card.Content>
	</Card.Root>
</main>
