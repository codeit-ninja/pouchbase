<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import type { InstalledPlugin } from './types';
	import { uninstallPlugin } from './plugins.remote';

	type Props = { plugin: InstalledPlugin } & DialogProps;

	let { plugin, close }: Props = $props();

	const form = $derived(uninstallPlugin.for(plugin.id));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Remove {plugin.name}</Dialog.Title>
		<Dialog.Description>
			This removes the plugin from Pouchbase. You can install it again from the marketplace.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success={`${plugin.name} removed`}
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={plugin.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit variant="danger">Remove plugin</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
