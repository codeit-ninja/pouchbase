<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { deleteApiKey } from './api-keys.remote';
	import type { ApiKey } from './types';

	type Props = { apiKey: ApiKey } & DialogProps;

	let { apiKey, close }: Props = $props();

	const form = $derived(deleteApiKey.for(apiKey.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Delete API key</Dialog.Title>
		<Dialog.Description>
			Code that uses <strong class="font-medium text-zinc-900">{apiKey.name}</strong> can no longer call
			the API with it, for example to send email.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="API key deleted"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={apiKey.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Delete key</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
