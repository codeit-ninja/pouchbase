<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Copy from '#lib/components/ui/inputs/copy/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getFunction } from '../functions.remote';
	import FunctionCode from './function-code.svelte';
	import FunctionLogs from './function-logs.svelte';
	import FunctionSecrets from './function-secrets.svelte';
	import FunctionSettings from './function-settings.svelte';
	import FunctionTest from './function-test.svelte';
	import FunctionVersions from './function-versions.svelte';

	const TABS = [
		{ value: 'code', label: 'Code' },
		{ value: 'test', label: 'Test' },
		{ value: 'secrets', label: 'Secrets' },
		{ value: 'versions', label: 'Versions' },
		{ value: 'logs', label: 'Logs' },
		{ value: 'settings', label: 'Settings' }
	];

	const name = $derived(page.params.name ?? '');
	const fn = $derived(await getFunction(name));

	// Queries can't read the request URL, so the page builds the URL apps call.
	const endpoint = $derived(`${page.url.origin}/api/functions/${fn.name}`);

	let tab = $state('code');
</script>

<svelte:head>
	<title>{fn.name} · Functions · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Link href={resolve('/(app)/functions')}>Functions</Breadcrumb.Link>
		</Breadcrumb.Item>
		<Breadcrumb.Separator />
		<Breadcrumb.Item>
			<Breadcrumb.Page>{fn.name}</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<Page.Header>
			<div class="flex min-w-0 flex-col gap-1">
				<div class="flex flex-wrap items-center gap-2">
					<Page.Title>{fn.name}</Page.Title>
					{#if fn.deployed}
						<Badge.Root variant="success">v{fn.version}</Badge.Root>
					{:else}
						<Badge.Root variant="warning">Not deployed</Badge.Root>
					{/if}
					<Badge.Root variant="outline">
						{fn.requireAuth ? 'Signed-in users' : 'Anyone can call it'}
					</Badge.Root>
				</div>
				{#if fn.description}
					<Page.Description>{fn.description}</Page.Description>
				{/if}
			</div>
		</Page.Header>

		<Copy.Root value={endpoint} label="Copy URL" />

		<Segmented.Root value={tab} onValueChange={(next) => (tab = next)} aria-label="Function">
			{#each TABS as item (item.value)}
				<Segmented.Item value={item.value}>{item.label}</Segmented.Item>
			{/each}
		</Segmented.Root>

		{#snippet loading()}
			<div class="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
				<Spinner.Root />
				Loading…
			</div>
		{/snippet}

		<!-- Each tab loads its own data; the boundary shows a spinner until it is in. -->
		{#key tab}
			<svelte:boundary pending={loading}>
				{#if tab === 'code'}
					<!-- A new version (deploy or restore) starts the editor again from its code. -->
					{#key fn.version}
						<FunctionCode {fn} />
					{/key}
				{:else if tab === 'test'}
					<FunctionTest {fn} />
				{:else if tab === 'secrets'}
					<FunctionSecrets {fn} />
				{:else if tab === 'versions'}
					<FunctionVersions {fn} />
				{:else if tab === 'logs'}
					<FunctionLogs {fn} />
				{:else}
					<FunctionSettings {fn} />
				{/if}
			</svelte:boundary>
		{/key}
	</div>
</Page.Root>
