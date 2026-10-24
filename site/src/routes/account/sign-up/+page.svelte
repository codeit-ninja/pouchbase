<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { signUpSchema } from '#lib/schemas/account.js';
	import { resolve } from '$app/paths';
	import { signUp } from '../account.remote';
	import OauthButtons from '../oauth-buttons.svelte';
	import VerificationCallout from '../verification-callout.svelte';

	const form = signUp.preflight(signUpSchema);

	// Set once the account exists and waits for its email address to be verified.
	const created = $derived(form.result?.verify ? form.result.email : null);
</script>

<svelte:head>
	<title>Create an account · Pouchbase</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
	<Card.Root>
		<Card.Header>
			<Card.Title>Create an account</Card.Title>
			<Card.Description>
				You need an account to publish plugins. Plugins are listed as soon as you publish them.
			</Card.Description>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			{#if created}
				<VerificationCallout email={created} title="Check your inbox">
					We sent a link to {created}. Follow it to activate your account, then
					<a href={resolve('/account/sign-in')}>sign in</a>.
				</VerificationCallout>
			{:else}
				<OauthButtons />

				<Form.Root {form}>
					<Form.Field field={form.fields.name}>
						<Form.Label>Name</Form.Label>
						<Form.Input autocomplete="name" />
						<Form.Description>Your first and last name.</Form.Description>
						<Form.Errors />
					</Form.Field>

					<Form.Field field={form.fields.email}>
						<Form.Label>Email</Form.Label>
						<Form.Input type="email" autocomplete="email" />
						<Form.Errors />
					</Form.Field>

					<Form.Field field={form.fields._password}>
						<Form.Label>Password</Form.Label>
						<Form.Input type="password" autocomplete="new-password" />
						<Form.Description>At least 8 characters.</Form.Description>
						<Form.Errors />
					</Form.Field>

					<Form.Submit>Create account</Form.Submit>
				</Form.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<p class="text-center text-sm text-zinc-600">
		Already have an account? <a href={resolve('/account/sign-in')}>Sign in</a>
	</p>
</div>
