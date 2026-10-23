<script lang="ts">
	import { page } from '$app/state';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { resetPasswordSchema } from '#lib/schemas/password-auth.js';
	import { resetPassword } from '../account.remote';

	const token = $derived(page.url.searchParams.get('token') ?? '');

	const form = resetPassword.preflight(resetPasswordSchema);
</script>

<svelte:head>
	<title>Reset password</title>
</svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-4 py-12">
	<Card.Root>
		<Card.Header>
			<Card.Title>Reset password</Card.Title>
			<Card.Description>Choose a new password for your account.</Card.Description>
		</Card.Header>

		<Card.Content>
			{#if form.result?.reset}
				<Callout.Root>
					<Callout.Icon><Icon.Root icon="lucide:circle-check" /></Callout.Icon>
					<Callout.Body>
						<Callout.Title>Password changed</Callout.Title>
						<Callout.Description
							>You can sign in to the app with your new password.</Callout.Description
						>
					</Callout.Body>
				</Callout.Root>
			{:else if !token}
				<Callout.Root variant="error">
					<Callout.Icon><Icon.Root icon="lucide:link-2-off" /></Callout.Icon>
					<Callout.Body>
						<Callout.Title>Invalid link</Callout.Title>
						<Callout.Description>Open the link from the email again.</Callout.Description>
					</Callout.Body>
				</Callout.Root>
			{:else}
				<Form.Root {form}>
					<Form.Hidden field={form.fields.token} value={token} />

					<Form.Field field={form.fields._password}>
						<Form.Label>New password</Form.Label>
						<Form.Input type="password" autocomplete="new-password" />
						<Form.Errors />
					</Form.Field>

					<Form.Field field={form.fields._passwordConfirm}>
						<Form.Label>Repeat password</Form.Label>
						<Form.Input type="password" autocomplete="new-password" />
						<Form.Errors />
					</Form.Field>

					<Form.Submit>Change password</Form.Submit>
				</Form.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</main>
