<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteFunctionSecret } from '../functions.remote';
	import type { FunctionData } from '../types';

	type Props = { fn: FunctionData; name: string } & DialogProps;

	let { fn, name, close }: Props = $props();

	const form = $derived(deleteFunctionSecret.for(name));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete secret</Dialog.Title>
		<Dialog.Description>
			<code class="font-medium text-zinc-900">env.{name}</code> is no longer set for
			<strong class="font-medium text-zinc-900">{fn.name}</strong>. The value can't be recovered.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Secret deleted"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={fn.id} />
		<Form.Hidden field={form.fields.name} value={name} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete secret</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
