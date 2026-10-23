<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { signInSchema } from '#lib/schemas/account.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { signIn } from '../account.remote';
	import OauthButtons from '../oauth-buttons.svelte';

	const form = signIn.preflight(signInSchema);

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/account');
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
			<OauthButtons {redirectTo} />

			<Form.Root {form}>
				<Form.Hidden field={form.fields.redirectTo} value={redirectTo} />

				<Form.Field field={form.fields.identity}>
					<Form.Label>Username or email</Form.Label>
					<Form.Input autocomplete="username" />
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
