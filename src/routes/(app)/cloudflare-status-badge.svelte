<script lang="ts">
	import type { ResourceStatus } from '#lib/cloudflare/types.js';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';

	type Props = {
		status: ResourceStatus;
		/** Label for `not_created`, e.g. `Not deployed` for the Worker. */
		notCreatedLabel?: string;
	};

	let { status, notCreatedLabel = 'Not created yet' }: Props = $props();
</script>

<!-- Whether a resource of this installation exists on the Cloudflare account. -->
{#if status === 'connected'}
	<Badge.Root class="bg-emerald-50 text-emerald-700">
		<Icon.Root icon="lucide:circle-check" />
		Connected
	</Badge.Root>
{:else if status === 'missing'}
	<Badge.Root class="bg-red-50 text-red-700">
		<Icon.Root icon="lucide:circle-x" />
		Missing
	</Badge.Root>
{:else}
	<Badge.Root variant="outline">{notCreatedLabel}</Badge.Root>
{/if}
