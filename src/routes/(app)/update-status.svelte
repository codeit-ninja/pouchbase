<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { getUpdateStatus } from '#lib/remote/updates.remote.js';
	import UpdateDialog from './update-dialog.svelte';

	const dialogs = Dialog.getDialogs();
	const status = $derived(await getUpdateStatus());

	function open() {
		void dialogs.open(UpdateDialog, {});
	}
</script>

<Sidebar.Status>
	<Badge.Root variant="outline" onclick={open} aria-label="Pouchbase version {status.current}">
		v{status.current}
	</Badge.Root>

	{#if status.available && status.latest}
		<Badge.Root variant="success" onclick={open} class="ml-auto">
			<Icon.Root icon="lucide:circle-arrow-up" />
			Update to v{status.latest.version}
		</Badge.Root>
	{/if}
</Sidebar.Status>
