<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteDeployToken } from './environments.remote';
	import type { DeployToken } from './types';

	type Props = { token: DeployToken } & DialogProps;

	let { token, close }: Props = $props();

	const form = $derived(deleteDeployToken.for(token.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete deploy token</Dialog.Title>
		<Dialog.Description>
			Instances that use <strong class="font-medium text-zinc-900">{token.name}</strong> can no longer
			read this instance's schema or publish to it.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Deploy token deleted"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={token.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete token</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
