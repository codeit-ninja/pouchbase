<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as CopyButton from '#lib/components/ui/copy-button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import { deployTokenSchema } from '#lib/schemas/environments.js';
	import { createDeployToken } from './environments.remote';

	let { close }: DialogProps = $props();

	const form = createDeployToken.preflight(deployTokenSchema);

	/** The new token, shown once after it was created. */
	let token = $state<string | null>(null);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>New deploy token</Dialog.Title>
		<Dialog.Description>
			A development instance uses the token to read this instance's schema and publish to it.
		</Dialog.Description>
	</Dialog.Header>

	{#if token}
		<div class="flex flex-col gap-4">
			<Callout.Root variant="warning">
				<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>
						Copy the token now: it isn't shown again. Anyone with it can change this instance's
						schema.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>

			<div class="flex gap-2">
				<Input.Root
					value={token}
					readonly
					aria-label="Deploy token"
					class="min-w-0 flex-1 font-mono"
				/>
				<CopyButton.Root value={token} label="Copy token" />
			</div>
		</div>

		<Dialog.Footer>
			<Button.Root onclick={() => close()}>Done</Button.Root>
		</Dialog.Footer>
	{:else}
		<Form.Root
			{form}
			enhance={async (instance) => {
				if (await instance.submit()) {
					token = instance.result?.token ?? null;
				}
			}}
		>
			<Form.Field field={form.fields.name}>
				<Form.Label>Name</Form.Label>
				<Form.Input placeholder="Local development" autocomplete="off" />
				<Form.Description>So you know later which instance uses it.</Form.Description>
				<Form.Errors />
			</Form.Field>

			<Dialog.Footer>
				<Dialog.Close>Cancel</Dialog.Close>
				<Form.Submit>Create token</Form.Submit>
			</Dialog.Footer>
		</Form.Root>
	{/if}
</Dialog.Content>
