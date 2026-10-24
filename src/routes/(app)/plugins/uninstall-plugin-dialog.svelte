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
			This removes the plugin and its Worker from Pouchbase. You can install it again from the
			marketplace.
			{#if plugin.replacesBuiltIn}
				The built-in version of this plugin takes its place again.
			{/if}
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
