<script lang="ts">
	import { page } from '$app/state';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { verifyEmailSchema } from '#lib/schemas/password-auth.js';
	import { verifyEmail } from '../account.remote';

	const token = $derived(page.url.searchParams.get('token') ?? '');

	const form = verifyEmail.preflight(verifyEmailSchema);
</script>

<svelte:head>
	<title>Verify email</title>
</svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-4 py-12">
	<Card.Root>
		<Card.Header>
			<Card.Title>Verify your email</Card.Title>
			<Card.Description>Confirm the email address of your account.</Card.Description>
		</Card.Header>

		<Card.Content>
			{#if form.result?.verified}
				<Callout.Root>
					<Callout.Icon><Icon.Root icon="lucide:circle-check" /></Callout.Icon>
					<Callout.Body>
						<Callout.Title>Email verified</Callout.Title>
						<Callout.Description>You can close this page and return to the app.</Callout.Description
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
				<!-- A button rather than verifying on load: mail scanners open links too. -->
				<Form.Root {form}>
					<Form.Hidden field={form.fields.token} value={token} />
					<Form.Submit>Verify email</Form.Submit>
				</Form.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</main>
