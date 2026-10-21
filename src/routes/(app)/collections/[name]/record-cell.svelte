<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { formatTimestamp, plainText, type GridColumn, type GridValue } from './grid';

	type Props = {
		column: GridColumn;
		value: GridValue | undefined;
	};

	let { column, value }: Props = $props();

	const type = $derived(column.field?.type);
</script>

{#if value === null || value === undefined || (Array.isArray(value) && !value.length)}
	<span class="text-xs text-zinc-400 italic">NULL</span>
{:else if column.name === 'created_at' || column.name === 'updated_at' || type === 'date'}
	<span class="font-mono text-xs">{formatTimestamp(value as number | string)}</span>
{:else if column.name === 'id'}
	<span class="font-mono text-xs text-zinc-500">{value}</span>
{:else if type === 'boolean'}
	{#if value === 1}
		<Icon.Root icon="lucide:check" label="True" class="size-4 text-zinc-900" />
	{:else}
		<Icon.Root icon="lucide:x" label="False" class="size-4 text-zinc-400" />
	{/if}
{:else if type === 'relation' && Array.isArray(value)}
	<span class="flex gap-1">
		{#each value as ref (ref.id)}
			<Badge.Root title={ref.id}>{ref.label}</Badge.Root>
		{/each}
	</span>
{:else if type === 'blob'}
	<span class="text-zinc-500">{value} bytes</span>
{:else if type === 'rich_text'}
	{plainText(String(value))}
{:else if type === 'json'}
	<span class="font-mono text-xs">{value}</span>
{:else}
	{value}
{/if}
