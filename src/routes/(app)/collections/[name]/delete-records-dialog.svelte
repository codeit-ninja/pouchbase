<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteRecords } from './records.remote';

	type Props = {
		collection: { name: string };
		ids: string[];
	} & DialogProps<boolean>;

	let { collection, ids, close }: Props = $props();

	const label = $derived(ids.length === 1 ? '1 record' : `${ids.length} records`);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete {label}</Dialog.Title>
		<Dialog.Description>
			This permanently deletes {label} from
			<span class="font-mono">{collection.name}</span>. This can't be undone.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		form={deleteRecords}
		success={ids.length === 1 ? 'Record deleted' : `${ids.length} records deleted`}
		enhance={async (instance) => {
			if (await instance.submit()) {
				close(true);
			}
		}}
	>
		<Form.Hidden field={deleteRecords.fields.collection} value={collection.name} />
		<Form.Hidden field={deleteRecords.fields.ids} value={JSON.stringify(ids)} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete {label}</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
