<script lang="ts">
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import EditCollectionFields from './edit-collection-fields.svelte';
	import type { GridField } from './grid';

	type Props = {
		collection: { id: string; name: string };
		fields: GridField[];
		/** Opens the new field dialog right away. */
		newField?: boolean;
		open?: boolean;
	};

	let { collection, fields, newField = false, open = $bindable(false) }: Props = $props();
</script>

<Sheet.Root bind:open>
	<Sheet.Content>
		<Sheet.Header>
			<Sheet.Title>Edit collection</Sheet.Title>
			<Sheet.Description>
				Fields and indexes of <span class="font-mono">{collection.name}</span>. Drag the fields to
				change the column order.
			</Sheet.Description>
		</Sheet.Header>

		<!-- Mounted each time the sheet opens, so it starts from the saved fields. -->
		<EditCollectionFields {collection} {fields} {newField} onSaved={() => (open = false)} />
	</Sheet.Content>
</Sheet.Root>
