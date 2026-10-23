<script lang="ts">
	import type { UsageRange } from '#lib/cloudflare/limits.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import { RANGE_LABELS, USAGE_RANGES } from '#lib/cloudflare/limits.js';
	import CloudflareLimits from './cloudflare-limits.svelte';
	import CloudflareResources from './cloudflare-resources.svelte';
	import CloudflareSection from './cloudflare-section.svelte';
	import CloudflareUsage from './cloudflare-usage.svelte';
	import CloudflareWorker from './cloudflare-worker.svelte';

	let range = $state<UsageRange>('7d');
</script>

<!-- The Cloudflare account behind this installation: its resources, the Worker, usage and limits. -->
<CloudflareSection
	id="cloudflare-resources"
	title="Cloudflare resources"
	description="What this installation created on the account, and whether it is still there."
	skeleton="tiles"
>
	<CloudflareResources />
</CloudflareSection>

<CloudflareSection
	id="cloudflare-worker"
	title="Worker"
	description="The deployed Worker and what is bound to it."
	skeleton="table"
>
	<CloudflareWorker />
</CloudflareSection>

<CloudflareSection
	id="cloudflare-usage"
	title="Usage"
	description="This installation's Worker and bucket; D1 for the whole account. Times are UTC."
	skeleton="charts"
>
	{#snippet actions()}
		<Segmented.Root
			value={range}
			onValueChange={(value) => (range = value as UsageRange)}
			aria-label="Range"
		>
			{#each USAGE_RANGES as option (option)}
				<Segmented.Item value={option} aria-label={RANGE_LABELS[option]}>{option}</Segmented.Item>
			{/each}
		</Segmented.Root>
	{/snippet}

	<CloudflareUsage {range} />
</CloudflareSection>

<CloudflareSection
	id="cloudflare-limits"
	title="Limits"
	description="How close the account is to the quotas of its Workers plan."
	skeleton="meters"
>
	<CloudflareLimits />
</CloudflareSection>
