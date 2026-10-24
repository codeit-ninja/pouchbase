<script lang="ts">
	import type { PluginSummary } from '@pouchbasejs/plugin-sdk';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { categoryLabel } from '#lib/plugin-categories.js';

	let { plugin }: { plugin: PluginSummary } = $props();

	const numberFormat = new Intl.NumberFormat('en-US', { notation: 'compact' });
</script>

<Card.Root class="flex h-full flex-col">
	<Card.Header>
		<div class="flex flex-wrap items-center gap-2">
			<Card.Title class="font-display">{plugin.name}</Card.Title>
			{#if plugin.verified}
				<Badge.Root variant="brand">
					<Icon.Root icon="lucide:badge-check" />
					Verified
				</Badge.Root>
			{/if}
		</div>
		<span class="font-mono text-xs text-zinc-500">{plugin.id}</span>
	</Card.Header>

	<Card.Content class="flex flex-1 flex-col gap-4">
		<p class="flex-1 text-sm text-zinc-600">{plugin.description}</p>

		{#if plugin.categories.length}
			<ul class="flex flex-wrap gap-1.5" aria-label="Categories">
				{#each plugin.categories as category (category)}
					<li><Badge.Root variant="outline">{categoryLabel(category)}</Badge.Root></li>
				{/each}
			</ul>
		{/if}

		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
			{#if plugin.author}
				<span class="flex items-center gap-1">
					<Icon.Root icon="lucide:user" class="size-3.5" />
					{plugin.author}
				</span>
			{/if}
			<span class="flex items-center gap-1 font-mono">
				<Icon.Root icon="lucide:tag" class="size-3.5" />
				{plugin.version}
			</span>
			<span class="flex items-center gap-1">
				<Icon.Root icon="lucide:download" class="size-3.5" />
				{numberFormat.format(plugin.downloads)}
				<span class="sr-only">downloads</span>
			</span>
		</div>
	</Card.Content>
</Card.Root>
