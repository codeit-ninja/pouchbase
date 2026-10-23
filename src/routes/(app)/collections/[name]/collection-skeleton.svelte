<script lang="ts">
	import * as DataGrid from '#lib/components/ui/data-grid/index.js';
	import * as Skeleton from '#lib/components/ui/skeleton/index.js';
	import CollectionTopbar from './collection-topbar.svelte';

	type Props = {
		name: string;
	};

	let { name }: Props = $props();

	// Fixed widths per column, so the placeholder looks like a real table instead of a block.
	const columns = ['w-24', 'w-32', 'w-28', 'w-40', 'w-20'];
	const rows = 12;
</script>

<!-- Placeholder for a collection page while its records load: the real Topbar (actions
disabled) with placeholder rows. -->
<CollectionTopbar {name} />

<DataGrid.Root aria-busy="true" aria-label="Loading records">
	<DataGrid.Header>
		<DataGrid.Head class="w-10">
			<Skeleton.Root class="size-4" />
		</DataGrid.Head>

		{#each columns as width, index (index)}
			<DataGrid.Head class="min-w-40">
				<Skeleton.Root class={['h-3', width]} />
			</DataGrid.Head>
		{/each}

		<DataGrid.Head class="w-10"></DataGrid.Head>
	</DataGrid.Header>

	<DataGrid.Body>
		{#each { length: rows }, row (row)}
			<DataGrid.Row>
				<DataGrid.Cell class="w-10">
					<Skeleton.Root class="size-4" />
				</DataGrid.Cell>

				{#each columns as width, index (index)}
					<DataGrid.Cell>
						<Skeleton.Root class={['h-3', width]} />
					</DataGrid.Cell>
				{/each}

				<DataGrid.Cell></DataGrid.Cell>
			</DataGrid.Row>
		{/each}
	</DataGrid.Body>
</DataGrid.Root>

<DataGrid.Footer>
	<span class="sr-only" role="status">Loading…</span>
	<Skeleton.Root class="h-4 w-28" />
	<Skeleton.Root class="h-4 w-24" />
</DataGrid.Footer>
