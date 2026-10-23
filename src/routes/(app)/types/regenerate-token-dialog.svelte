<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { regenerateTypesToken } from './types.remote';

	let { close }: DialogProps = $props();
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>New token</Dialog.Title>
		<Dialog.Description>
			The current URL stops working. Scripts and CI jobs that generate the types need the new URL.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		form={regenerateTypesToken}
		success="New token created"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Create new token</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
