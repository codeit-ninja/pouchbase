<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteFunction } from '../functions.remote';
	import type { FunctionData } from '../types';

	type Props = { fn: FunctionData } & DialogProps;

	let { fn, close }: Props = $props();
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete function</Dialog.Title>
		<Dialog.Description>
			<strong class="font-medium text-zinc-900">{fn.name}</strong> stops working right away: its Worker,
			secrets and versions are deleted. This can't be undone.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		form={deleteFunction}
		success="Function deleted"
		enhance={async (instance) => {
			// Deleting redirects to the Functions page.
			await instance.submit();
			close();
		}}
	>
		<Form.Hidden field={deleteFunction.fields.id} value={fn.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete function</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
