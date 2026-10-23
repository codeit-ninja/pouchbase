<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { skipStorageMigration } from './storage.remote';

	type Props = {
		/** Where the files are now, e.g. `Cloudflare R2`. */
		source: string;
		remaining: number;
	} & DialogProps<boolean>;

	let { source, remaining, close }: Props = $props();

	const label = $derived(remaining === 1 ? '1 file' : `${remaining} files`);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Skip moving files</Dialog.Title>
		<Dialog.Description>
			Pouchbase stops reading from {source}. The {label} that weren't moved yet can no longer be downloaded,
			unless you copy them to the new storage yourself. Nothing is deleted.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		form={skipStorageMigration}
		success="Stopped moving files"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close(true);
			}
		}}
	>
		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Skip {label}</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
