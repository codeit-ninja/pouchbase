<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as CopyButton from '#lib/components/ui/copy-button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import { apiKeySchema } from '#lib/schemas/api-keys.js';
	import { createApiKey } from './api-keys.remote';

	let { close }: DialogProps = $props();

	const form = createApiKey.preflight(apiKeySchema);

	const scopes = [
		{
			value: 'standard',
			label: 'Standard',
			description: 'Server-only endpoints, such as sending email.'
		},
		{
			value: 'service',
			label: 'Service',
			description: "Also reads and writes every record; API rules don't apply."
		}
	];

	/** The new key, shown once after it was created. */
	let key = $state<string | null>(null);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>New API key</Dialog.Title>
		<Dialog.Description>
			Server-side code, such as your back-end, uses the key to send email through the API, or with
			the service scope to manage records.
		</Dialog.Description>
	</Dialog.Header>

	{#if key}
		<div class="flex flex-col gap-4">
			<Callout.Root variant="warning">
				<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>
						Copy the key now: it isn't shown again. Keep it on your server; never put it in an app
						that runs in the browser.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>

			<div class="flex gap-2">
				<Input.Root value={key} readonly aria-label="API key" class="min-w-0 flex-1 font-mono" />
				<CopyButton.Root value={key} label="Copy key" />
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
					key = instance.result?.key ?? null;
				}
			}}
		>
			<Form.Field field={form.fields.name}>
				<Form.Label>Name</Form.Label>
				<Form.Input placeholder="Back-end" autocomplete="off" />
				<Form.Description>So you know later what uses it.</Form.Description>
				<Form.Errors />
			</Form.Field>

			<Form.Field field={form.fields.scope}>
				<Form.Label>Scope</Form.Label>
				<Form.Select items={scopes} defaultValue="standard" />
				<Form.Description>
					A service key acts as an admin on the records API. Give it only to servers you trust.
				</Form.Description>
				<Form.Errors />
			</Form.Field>

			<Dialog.Footer>
				<Dialog.Close>Cancel</Dialog.Close>
				<Form.Submit>Create key</Form.Submit>
			</Dialog.Footer>
		</Form.Root>
	{/if}
</Dialog.Content>
