<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { LayoutProps } from './$types';
	import AppSidebar from './app-sidebar.svelte';

	let { children }: LayoutProps = $props();
</script>

<!-- Fixed to the viewport: pages scroll inside their own content area (Page.Root or a DataGrid). -->
<Dialog.Provider>
	<div class="flex h-svh overflow-hidden">
		<AppSidebar />

		<!-- Each page renders its own Topbar (breadcrumbs + actions) followed by its content. -->
		<div class="flex min-w-0 flex-1 flex-col">
			{@render children()}
		</div>
	</div>
</Dialog.Provider>
