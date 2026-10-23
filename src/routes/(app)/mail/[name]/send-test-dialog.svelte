<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import type { MailTemplateContent } from '#lib/mail/mail-templates.js';
	import type { Variables } from '#lib/mail/template.js';
	import { sendTestMailTemplate } from '../mail.remote';

	type Props = DialogProps & {
		content: MailTemplateContent;
		sampleData: Variables;
		/** The address the field starts with, e.g. the admin's. */
		to?: string;
	};

	let { content, sampleData, to = '', close }: Props = $props();

	// svelte-ignore state_referenced_locally
	let address = $state(to);
	let failure = $state<string | null>(null);

	function message(error: unknown) {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		return typeof body?.message === 'string' ? body.message : 'Could not send the email';
	}

	async function send() {
		failure = null;

		try {
			await sendTestMailTemplate({ ...content, sampleData, to: address });
			toast.success(`Test email sent to ${address}`);
			close();
		} catch (error) {
			failure = message(error);
		}
	}
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Send a test email</Dialog.Title>
		<Dialog.Description>
			Sends the email as it is in the editor, also when it isn't saved, with the sample data.
		</Dialog.Description>
	</Dialog.Header>

	<div class="flex flex-col gap-4">
		{#if failure}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>{failure}</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}

		<Field.Root>
			<Field.Label for="mail-test-to">Send to</Field.Label>
			<Input.Root id="mail-test-to" type="email" bind:value={address} autocomplete="email" />
		</Field.Root>
	</div>

	<Dialog.Footer>
		<Dialog.Close>Cancel</Dialog.Close>
		<Button.Root disabled={!address.includes('@')} onclick={send}>
			<Icon.Root icon="lucide:send" />
			Send
		</Button.Root>
	</Dialog.Footer>
</Dialog.Content>
