<script lang="ts">
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { getUser, signOut } from './account.remote';
	import PluginsTable from './plugins-table.svelte';
	import PublishCard from './publish-card.svelte';
	import TokensCard from './tokens-card.svelte';

	const user = $derived(await getUser());
</script>

<svelte:head>
	<title>Your plugins · Pouchbase</title>
</svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="font-display text-3xl font-semibold tracking-tight text-zinc-950">Your plugins</h1>
			{#if user}
				<p class="text-sm text-zinc-600">Signed in as {user.username || user.email}</p>
			{/if}
		</div>

		<Form.Root form={signOut}>
			<Form.Submit variant="ghost">
				<Icon.Root icon="lucide:log-out" />
				Sign out
			</Form.Submit>
		</Form.Root>
	</div>

	<PluginsTable />

	<PublishCard />

	<TokensCard />
</div>
