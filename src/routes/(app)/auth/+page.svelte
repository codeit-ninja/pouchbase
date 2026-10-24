<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Link from '#lib/components/ui/link/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as ProviderIcon from '#lib/components/ui/provider-icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tile from '#lib/components/ui/tile/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getAuthSettings } from './auth-settings.remote';
	import PasswordDialog from './password-dialog.svelte';
	import ProviderDialog from './provider-dialog.svelte';

	const settings = $derived(await getAuthSettings());

	type OAuthSettings = (typeof settings.providers)[number];

	/**
	 * Email & password and the OAuth providers, as tiles. The providers come from sign-in plugins,
	 * with their own logo (`iconUrl`); `icon` is the fallback.
	 */
	type Method =
		| {
				kind: 'password';
				key: string;
				label: string;
				icon: string;
				iconUrl: null;
				active: boolean;
		  }
		| {
				kind: 'oauth';
				key: string;
				label: string;
				icon: string;
				iconUrl: string | null;
				active: boolean;
				provider: OAuthSettings;
		  };

	const methods = $derived<Method[]>([
		{
			kind: 'password',
			key: 'password',
			label: 'Email & password',
			icon: 'lucide:key-round',
			iconUrl: null,
			active: settings.password.enabled
		},
		...settings.providers.map((provider) => ({
			kind: 'oauth' as const,
			key: provider.provider,
			label: provider.label,
			icon: 'lucide:log-in',
			iconUrl: provider.iconUrl,
			active: provider.enabled,
			provider
		}))
	]);

	const active = $derived(methods.filter((method) => method.active));
	const available = $derived(methods.filter((method) => !method.active));

	const endpoints = [
		{ method: 'GET', path: '/api/auth/providers', purpose: 'Active OAuth providers' },
		{
			method: 'POST',
			path: '/api/auth/password/sign-up',
			purpose: 'Create a user: { name, email, password }'
		},
		{
			method: 'POST',
			path: '/api/auth/password/sign-in',
			purpose: 'Sign in: { email, password }'
		},
		{
			method: 'POST',
			path: '/api/auth/password/request-reset',
			purpose: 'Email a link to choose a new password: { email }'
		},
		{
			method: 'POST',
			path: '/api/auth/password/confirm-reset',
			purpose: 'Set the new password: { token, password }'
		},
		{
			method: 'POST',
			path: '/api/auth/verification/request',
			purpose: 'Email a link to verify the address: { email }'
		},
		{
			method: 'POST',
			path: '/api/auth/verification/confirm',
			purpose: 'Verify the address: { token }'
		},
		{
			method: 'GET',
			path: '/api/auth/oauth2/<provider>?state=…&challenge=…',
			purpose: 'Open in a popup to sign in with a provider'
		},
		{
			method: 'POST',
			path: '/api/auth/oauth2/result',
			purpose: 'Poll with { state, verifier } until the popup is done'
		},
		{
			method: 'GET',
			path: '/api/auth/me',
			purpose: 'The signed-in user (Authorization: Bearer <token>)'
		}
	];

	const dialogs = Dialog.getDialogs();

	function configure(method: Method) {
		if (method.kind === 'password') {
			void dialogs.open(PasswordDialog, { settings: settings.password });
		} else {
			void dialogs.open(ProviderDialog, { provider: method.provider });
		}
	}
</script>

<svelte:head>
	<title>Authentication</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Authentication</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-10">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Authentication</Page.Title>
				<Page.Description>
					How users of your app sign in. Users are stored in the
					<span class="font-mono">users</span> collection.
				</Page.Description>
			</div>
		</Page.Header>

		<section class="flex flex-col gap-4" aria-labelledby="active-methods">
			<h2 id="active-methods" class="text-sm font-semibold text-zinc-900">Active</h2>

			{#if active.length}
				<Tile.Grid>
					{#each active as method (method.key)}
						<Tile.Root>
							<Tile.Header>
								<Tile.Icon>
									<ProviderIcon.Root src={method.iconUrl} fallback={method.icon} class="size-5" />
								</Tile.Icon>
								<Tile.Title>{method.label}</Tile.Title>
								<Badge.Root class="bg-emerald-50 text-emerald-700">Active</Badge.Root>
							</Tile.Header>

							{#if method.kind === 'password'}
								<Tile.Description>
									{settings.password.signUp ? 'Sign-up allowed' : 'Sign-up disabled'}
								</Tile.Description>
							{/if}

							<Tile.Footer>
								<Button.Root variant="secondary" class="w-full" onclick={() => configure(method)}>
									<Icon.Root icon="lucide:settings-2" />
									Configure
								</Button.Root>
							</Tile.Footer>
						</Tile.Root>
					{/each}
				</Tile.Grid>
			{:else}
				<Empty.Root class="py-8">
					<Empty.Icon><Icon.Root icon="lucide:shield-check" /></Empty.Icon>
					<Empty.Title>No active sign-in methods</Empty.Title>
					<Empty.Description>Set one up below to let users sign in.</Empty.Description>
				</Empty.Root>
			{/if}
		</section>

		<section class="flex flex-col gap-4" aria-labelledby="available-methods">
			<div class="flex flex-col gap-1">
				<h2 id="available-methods" class="text-sm font-semibold text-zinc-900">Available</h2>
				<p class="text-sm text-zinc-500">
					Sign-in providers come from plugins. Google, GitHub, Microsoft, Discord and Twitch are
					built in; install more from the
					<Link.Root href={resolve('/(app)/plugins')} class="text-zinc-900 underline"
						>Plugins page</Link.Root
					>.
				</p>
			</div>

			{#if available.length}
				<Tile.Grid>
					{#each available as method (method.key)}
						<Tile.Root>
							<Tile.Header>
								<Tile.Icon>
									<ProviderIcon.Root src={method.iconUrl} fallback={method.icon} class="size-5" />
								</Tile.Icon>
								<Tile.Title>{method.label}</Tile.Title>
								{#if method.kind === 'oauth' && method.provider.clientId}
									<Badge.Root variant="outline">Inactive</Badge.Root>
								{/if}
							</Tile.Header>

							<Tile.Footer>
								<Button.Root class="w-full" onclick={() => configure(method)}>
									<Icon.Root icon="lucide:plus" />
									Set up
								</Button.Root>
							</Tile.Footer>
						</Tile.Root>
					{/each}
				</Tile.Grid>
			{:else}
				<p class="text-sm text-zinc-500">Every sign-in method is active.</p>
			{/if}
		</section>

		<section class="flex flex-col gap-4" aria-labelledby="api">
			<div class="flex flex-col gap-1">
				<h2 id="api" class="text-sm font-semibold text-zinc-900">Use it from your app</h2>
				<p class="text-sm text-zinc-500">
					Every sign-in returns <span class="font-mono">{'{ token, user_id }'}</span>. Send the
					token as <span class="font-mono">Authorization: Bearer &lt;token&gt;</span>; it is valid
					for 7 days. The API can be called from any origin.
				</p>
			</div>

			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Request</Table.Head>
						<Table.Head>Purpose</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each endpoints as endpoint (endpoint.path)}
						<Table.Row>
							<Table.Cell class="font-mono text-xs whitespace-nowrap">
								<span class="font-semibold text-zinc-900">{endpoint.method}</span>
								{endpoint.path}
							</Table.Cell>
							<Table.Cell>{endpoint.purpose}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</section>
	</div>
</Page.Root>
