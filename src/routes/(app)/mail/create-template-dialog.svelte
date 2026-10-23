<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { createMailTemplateSchema } from '#lib/schemas/mail-templates.js';
	import { createMailTemplate } from './mail.remote';

	let { close }: DialogProps = $props();

	const form = createMailTemplate.preflight(createMailTemplateSchema);

	const editors = [
		{ value: 'visual', label: 'Visual editor', icon: 'lucide:pencil-ruler' },
		{ value: 'html', label: 'HTML', icon: 'lucide:code-xml' }
	];
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>New email template</Dialog.Title>
		<Dialog.Description>
			A subject and a body with variables, such as <code>{'{{name}}'}</code>. Functions and your
			back-end send it with an API key.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Template created"
		enhance={async (instance) => {
			// Creating redirects to the template's page.
			await instance.submit();
			close();
		}}
	>
		<Form.Field field={form.fields.name}>
			<Form.Label>Name</Form.Label>
			<Form.Input placeholder="welcome-email" autocomplete="off" />
			<Form.Description>
				Lowercase letters, digits and dashes. Code sends it by this name.
			</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.description}>
			<Form.Label>Description</Form.Label>
			<Form.Input placeholder="Sent after sign-up" autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.editor}>
			<Form.Label>Editor</Form.Label>
			<Form.Select items={editors} defaultValue="visual" />
			<Form.Description>
				The visual editor lays out the email for you; with HTML you write the whole document.
			</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Create template</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
