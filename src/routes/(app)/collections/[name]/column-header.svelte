<script lang="ts">
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import type { GridColumn } from './grid';

	type Props = {
		column: GridColumn;
		/** Current sort direction of this column, if it is the sorted one. */
		sorted?: 'asc' | 'desc';
		onSort: (order: 'asc' | 'desc') => void;
		onRename: () => void;
		onDelete: () => void;
		/** Only for computed fields: change how the value is calculated. */
		onEditComputation?: () => void;
	};

	let { column, sorted, onSort, onRename, onDelete, onEditComputation }: Props = $props();
</script>

{#if column.virtual}
	<!-- Not a field: nothing to sort, rename or delete. -->
	<span class="flex items-center gap-2 text-xs font-medium text-zinc-600">
		<Icon.Root icon={column.icon} class="size-3.5 text-zinc-400" />
		<span class="text-zinc-900">{column.label}</span>
	</span>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			variant="ghost"
			class="-mx-3 h-row w-[calc(100%+1.5rem)] justify-start gap-2 rounded-none border-0 px-3 text-xs font-medium text-zinc-600"
			aria-label="{column.name} column options"
		>
			<Icon.Root icon={column.icon} class="size-3.5 text-zinc-400" />
			<span class="font-mono text-zinc-900">{column.name}</span>

			{#if column.field?.system}
				<Icon.Root icon="lucide:lock" label="Built-in field" class="size-3 text-zinc-400" />
			{/if}

			{#if column.field?.required}
				<span class="text-red-500" aria-label="required">*</span>
			{/if}

			{#if sorted === 'asc'}
				<Icon.Root icon="lucide:arrow-up" label="Sorted ascending" class="ml-auto size-3.5" />
			{:else if sorted === 'desc'}
				<Icon.Root icon="lucide:arrow-down" label="Sorted descending" class="ml-auto size-3.5" />
			{/if}
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="start">
			{#if column.sortable}
				<DropdownMenu.Item onSelect={() => onSort('asc')}>
					<Icon.Root icon="lucide:arrow-up" />
					Sort ascending
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => onSort('desc')}>
					<Icon.Root icon="lucide:arrow-down" />
					Sort descending
				</DropdownMenu.Item>
			{/if}

			{#if column.field && !column.field.system}
				{#if column.sortable}
					<DropdownMenu.Separator />
				{/if}

				<DropdownMenu.Item onSelect={onRename}>
					<Icon.Root icon="lucide:pencil" />
					Rename field
				</DropdownMenu.Item>

				{#if column.field.type === 'computed' && onEditComputation}
					<DropdownMenu.Item onSelect={onEditComputation}>
						<Icon.Root icon="lucide:square-function" />
						Edit computation
					</DropdownMenu.Item>
				{/if}

				<DropdownMenu.Separator />

				<DropdownMenu.Item variant="danger" onSelect={onDelete}>
					<Icon.Root icon="lucide:trash-2" />
					Delete field
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
