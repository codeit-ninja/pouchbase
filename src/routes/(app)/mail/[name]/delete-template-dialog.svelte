<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteMailTemplate } from '../mail.remote';

	type Props = { name: string } & DialogProps;

	let { name, close }: Props = $props();

	const form = $derived(deleteMailTemplate.for(name));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete template</Dialog.Title>
		<Dialog.Description>
			Code that sends <strong class="font-medium text-zinc-900">{name}</strong> gets a
			<code>404</code> from then on.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Template deleted"
		enhance={async (instance) => {
			// Deleting redirects to the Mail page.
			await instance.submit();
			close();
		}}
	>
		<Form.Hidden field={form.fields.name} value={name} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete template</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
