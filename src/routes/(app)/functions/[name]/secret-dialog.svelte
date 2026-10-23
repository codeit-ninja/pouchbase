<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { functionSecretSchema } from '#lib/schemas/functions.js';
	import { setFunctionSecret } from '../functions.remote';
	import type { FunctionData } from '../types';

	type Props = {
		fn: FunctionData;
		/** The secret to change; omitted for a new one. */
		name?: string;
	} & DialogProps;

	let { fn, name, close }: Props = $props();

	const form = $derived(setFunctionSecret.for(name ?? 'new').preflight(functionSecretSchema));
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>{name ? `Change ${name}` : 'Add secret'}</Dialog.Title>
		<Dialog.Description>
			Saving deploys the function again with the new value; requests use it within a few seconds.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Secret saved"
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={fn.id} />

		{#if name}
			<Form.Hidden field={form.fields.name} value={name} />
		{:else}
			<Form.Field field={form.fields.name}>
				<Form.Label>Name</Form.Label>
				<Form.Input placeholder="STRIPE_KEY" autocomplete="off" class="font-mono" />
				<Form.Errors />
			</Form.Field>
		{/if}

		<Form.Field field={form.fields._value}>
			<Form.Label>Value</Form.Label>
			<Form.Input type="password" autocomplete="new-password" />
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Save</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
