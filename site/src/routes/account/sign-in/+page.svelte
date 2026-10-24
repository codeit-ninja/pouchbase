<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { signInSchema } from '#lib/schemas/account.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { signIn } from '../account.remote';
	import OauthButtons from '../oauth-buttons.svelte';
	import VerificationCallout from '../verification-callout.svelte';

	const form = signIn.preflight(signInSchema);

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/account');

	// Set when the password was right but the email address isn't verified yet.
	const unverified = $derived(form.result?.unverified ? form.result.email : null);
</script>

<svelte:head>
	<title>Sign in · Pouchbase</title>
</svelte:head>

<div class="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
	<Card.Root>
		<Card.Header>
			<Card.Title>Sign in</Card.Title>
			<Card.Description>Publish and manage your plugins in the Pouchbase registry.</Card.Description
			>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			{#if unverified}
				<VerificationCallout email={unverified} title="Verify your email address">
					Your account is active once you follow the link we sent to {unverified}.
				</VerificationCallout>
			{/if}

			<OauthButtons {redirectTo} />

			<Form.Root {form}>
				<Form.Hidden field={form.fields.redirectTo} value={redirectTo} />

				<Form.Field field={form.fields.email}>
					<Form.Label>Email</Form.Label>
					<Form.Input type="email" autocomplete="email" />
					<Form.Errors />
				</Form.Field>

				<Form.Field field={form.fields._password}>
					<Form.Label>Password</Form.Label>
					<Form.Input type="password" autocomplete="current-password" />
					<Form.Errors />
				</Form.Field>

				<Form.Submit>Sign in</Form.Submit>
			</Form.Root>
		</Card.Content>
	</Card.Root>

	<p class="text-center text-sm text-zinc-600">
		No account yet? <a href={resolve('/account/sign-up')}>Create one</a>
	</p>
</div>
