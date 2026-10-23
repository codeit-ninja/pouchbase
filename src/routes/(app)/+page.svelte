<script lang="ts">
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { currentUser } from '../(auth)/auth.remote';
	import { getCloudflareAvailable } from './cloudflare.remote';
	import CloudflareOverview from './cloudflare-overview.svelte';
	import { listCollections } from './collections.remote';

	const [user, collections, cloudflare] = $derived(
		await Promise.all([currentUser(), listCollections(), getCloudflareAvailable()])
	);
</script>

<svelte:head>
	<title>Dashboard · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Dashboard</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-10">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Welcome, {user?.email}</Page.Title>
				<Page.Description>
					Manage your collections{cloudflare ? ' and keep an eye on your Cloudflare account' : ''}.
				</Page.Description>
			</div>
		</Page.Header>

		{#if !collections.length}
			<Empty.Root>
				<Empty.Icon><Icon.Root icon="lucide:table-2" /></Empty.Icon>
				<Empty.Title>No collections yet</Empty.Title>
				<Empty.Description>
					Create your first collection with the + button next to "Collections" in the sidebar.
				</Empty.Description>
			</Empty.Root>
		{/if}

		{#if cloudflare}
			<CloudflareOverview />
		{/if}
	</div>
</Page.Root>
