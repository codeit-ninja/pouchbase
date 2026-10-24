<script lang="ts">
	import { createClient, isPouchbaseError } from '@pouchbasejs/js-sdk';
	import type { OAuthProvider } from '@pouchbasejs/js-sdk';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Separator from '#lib/components/ui/separator/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import { isHttpError } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import { POUCHBASE_URL } from '$app/env/public';
	import { getProviders, startOAuthSession } from './account.remote';

	let { redirectTo = '/account' }: { redirectTo?: string } = $props();

	const providers = $derived(await getProviders());

	async function signInWith(provider: OAuthProvider) {
		try {
			// The popup opens before the first `await`, so browsers don't block it.
			const { token } = await createClient(POUCHBASE_URL ?? '').auth.signInWithOAuth(provider);

			await startOAuthSession(token);
			// Only paths on this site, so a sign-in link can't send people elsewhere.
			const target =
				redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/account';

			// eslint-disable-next-line svelte/no-navigation-without-resolve -- a path on this site, checked above
			await goto(target, { invalidateAll: true });
		} catch (error) {
			const code = isPouchbaseError(error) ? error.code : null;

			// The provider didn't confirm the email address, and the site only lets verified accounts in.
			if (isHttpError(error, 403)) {
				toast.error(error.body.message);

				return;
			}

			if (code !== 'popup_closed') {
				toast.error(
					code === 'popup_blocked' ? 'Allow popups to sign in' : 'Could not sign in, try again'
				);
			}
		}
	}
</script>

{#if providers.length}
	<div class="flex flex-col gap-2">
		{#each providers as { provider, label } (provider)}
			<Button.Root variant="secondary" onclick={() => signInWith(provider)}>
				{#if provider === 'github'}
					<Icon.Root icon="simple-icons:github" />
				{:else}
					<Icon.Root icon="lucide:log-in" />
				{/if}
				Continue with {label}
			</Button.Root>
		{/each}
	</div>

	<Separator.Root>or</Separator.Root>
{/if}
