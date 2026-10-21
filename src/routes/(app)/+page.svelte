<script lang="ts">
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getAppName } from '#lib/remote/settings.remote.js';
	import { currentUser } from '../(auth)/auth.remote';
	import { listCollections } from './collections.remote';

	const [appName, user, collections] = $derived(
		await Promise.all([getAppName(), currentUser(), listCollections()])
	);
</script>

<svelte:head>
	<title>{appName}</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Collections</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<Page.Header>
		<div class="flex flex-col gap-1">
			<Page.Title>Welcome, {user?.username}</Page.Title>
			<Page.Description>Manage the collections of {appName}.</Page.Description>
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
</Page.Root>
