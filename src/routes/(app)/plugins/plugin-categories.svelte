<script lang="ts">
	import { isPluginCategory, PLUGIN_CATEGORY_LABELS } from '@pouchbasejs/plugin-sdk';
	import * as Badge from '#lib/components/ui/badge/index.js';

	type Props = {
		/** Category ids; ones this Pouchbase doesn't know yet show as their id. */
		categories: readonly string[];
		class?: string;
	};

	let { categories, class: className }: Props = $props();
</script>

{#if categories.length}
	<ul class={['flex flex-wrap gap-1.5', className]} aria-label="Categories">
		{#each categories as category (category)}
			<li>
				<Badge.Root variant="outline">
					{isPluginCategory(category) ? PLUGIN_CATEGORY_LABELS[category] : category}
				</Badge.Root>
			</li>
		{/each}
	</ul>
{/if}
