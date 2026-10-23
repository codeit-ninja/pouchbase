<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { linkRemoteSchema } from '#lib/schemas/environments.js';
	import { linkRemote } from './environments.remote';

	let { close }: DialogProps = $props();

	const form = linkRemote.preflight(linkRemoteSchema);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Link instance</Dialog.Title>
		<Dialog.Description>
			Usually your production instance. Create a deploy token on its Environments page.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Instance linked"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Field field={form.fields.url}>
			<Form.Label>URL</Form.Label>
			<Form.Input type="url" placeholder="https://pouchbase.example.com" autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields._token}>
			<Form.Label>Deploy token</Form.Label>
			<Form.Input type="password" placeholder="pbdt_…" autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Link instance</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
