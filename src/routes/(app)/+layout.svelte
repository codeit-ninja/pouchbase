<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { LayoutProps } from './$types';
	import AppSidebar from './app-sidebar.svelte';
	import CollectionSkeleton from './collections/[name]/collection-skeleton.svelte';
	import PageSkeleton from './page-skeleton.svelte';

	let { children }: LayoutProps = $props();

	// Skeletons are only for client-side navigation: a boundary with a `pending` snippet renders
	// just that snippet during SSR, and the first load should arrive fully rendered.
	// Deliberately not reactive: flipping it must not re-render the boundary, it only affects
	// boundaries created later (the `{#key}` below creates one per navigation).
	const mounted = { hydrated: false };

	onMount(() => {
		mounted.hydrated = true;
	});

	// Breadcrumb shown by the skeleton of each regular page; keep in sync with the page's Topbar.
	const titles: Record<string, string> = {
		'/(app)': 'Dashboard',
		'/(app)/api-keys': 'API keys',
		'/(app)/auth': 'Authentication',
		'/(app)/environments': 'Environments',
		'/(app)/functions': 'Functions',
		'/(app)/mail': 'Mail'
	};
</script>

{#snippet skeleton()}
	{#if page.route.id === '/(app)/collections/[name]' && page.params.name}
		<CollectionSkeleton name={page.params.name} />
	{:else}
		<PageSkeleton title={titles[page.route.id ?? ''] ?? ''} />
	{/if}
{/snippet}

<!-- Fixed to the viewport: pages scroll inside their own content area (Page.Root or a DataGrid). -->
<Dialog.Provider>
	<div class="flex h-svh overflow-hidden">
		<AppSidebar />

		<!-- Each page renders its own Topbar (breadcrumbs + actions) followed by its content. -->
		<div class="flex min-w-0 flex-1 flex-col">
			<!--
				A `pending` snippet only shows when a boundary is created, so the boundary is recreated
				per path: switching pages or collections shows a skeleton until the new data is in.
				Updates on the same path (paging, sorting) keep the current content on screen.
			-->
			{#key page.url.pathname}
				<svelte:boundary pending={mounted.hydrated ? skeleton : undefined}>
					{@render children()}
				</svelte:boundary>
			{/key}
		</div>
	</div>
</Dialog.Provider>
