<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { resetMailTemplate } from '../mail.remote';

	type Props = { name: string } & DialogProps<boolean>;

	let { name, close }: Props = $props();

	const form = $derived(resetMailTemplate.for(name));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Reset template</Dialog.Title>
		<Dialog.Description>
			Puts <strong class="font-medium text-zinc-900">{name}</strong> back to the email Pouchbase ships
			with. Your changes are lost.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Template reset"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close(true);
			}
		}}
	>
		<Form.Hidden field={form.fields.name} value={name} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Reset template</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
