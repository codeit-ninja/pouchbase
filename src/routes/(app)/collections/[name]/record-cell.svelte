<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Link from '#lib/components/ui/link/index.js';
	import * as Thumbnail from '#lib/components/ui/thumbnail/index.js';
	import { listSelection } from '#lib/fields/field-types.js';
	import { FILES_COLLECTION, fileUrl, formatFileSize } from '#lib/files/files.js';
	import { formatTimestamp, plainText, recordHref, type GridColumn, type GridValue } from './grid';

	type Props = {
		column: GridColumn;
		value: GridValue | undefined;
	};

	let { column, value }: Props = $props();

	const type = $derived(column.field?.type);
</script>

{#if value === null || value === undefined || (Array.isArray(value) && !value.length)}
	<span class="text-xs text-zinc-400 italic">NULL</span>
{:else if type === 'created' || type === 'updated' || type === 'date'}
	<span class="font-mono text-xs">{formatTimestamp(value as number | string)}</span>
{:else if column.fileSize && typeof value === 'number'}
	{formatFileSize(value)}
{:else if (type === 'file' || (type === 'relation' && column.relationTarget === FILES_COLLECTION)) && Array.isArray(value)}
	<span class="flex items-center gap-2">
		{#each value as ref (ref.id)}
			<span class="inline-flex min-w-0 items-center gap-1.5" title={ref.id}>
				<Thumbnail.Root src={fileUrl(ref.id)} preview={fileUrl(ref.id)} alt={ref.label} size="sm">
					<Icon.Root icon="lucide:file" />
				</Thumbnail.Root>
				<!-- Opens the file's record in `files`, not the row's own record. -->
				<Link.Root
					href={recordHref(FILES_COLLECTION, ref.id)}
					class="truncate"
					onclick={(event) => event.stopPropagation()}
				>
					{ref.label}
				</Link.Root>
			</span>
		{/each}
	</span>
{:else if type === 'id'}
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
			<!-- A link to the related record; it doesn't open the row's own record. -->
			<Badge.Root
				href={column.relationTarget ? recordHref(column.relationTarget, ref.id) : undefined}
				title={ref.id}
				onclick={(event) => event.stopPropagation()}
			>
				{ref.label}
			</Badge.Root>
		{/each}
	</span>
{:else if type === 'list'}
	<span class="flex gap-1">
		{#each listSelection(value, column.field?.options.multiple) as item (item)}
			<Badge.Root>{item}</Badge.Root>
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
