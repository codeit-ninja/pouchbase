<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { createFunctionSchema } from '#lib/schemas/functions.js';
	import { createFunction } from './functions.remote';

	let { close }: DialogProps = $props();

	const form = createFunction.preflight(createFunctionSchema);

	const languages = [
		{ value: 'typescript', label: 'TypeScript', icon: 'logos:typescript-icon' },
		{ value: 'javascript', label: 'JavaScript', icon: 'logos:javascript' }
	];
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>New function</Dialog.Title>
		<Dialog.Description>
			A function runs your code on Cloudflare, as a Worker of its own. It starts with example code
			that you can change or replace with a file.
		</Dialog.Description>
	</Dialog.Header>

	<Form.Root
		{form}
		success="Function created"
		enhance={async (instance) => {
			// Creating redirects to the function's page.
			await instance.submit();
			close();
		}}
	>
		<Form.Field field={form.fields.name}>
			<Form.Label>Name</Form.Label>
			<Form.Input placeholder="send-email" autocomplete="off" />
			<Form.Description>
				Lowercase letters, digits and dashes. Apps call it on
				<code>/api/functions/&lt;name&gt;</code>.
			</Form.Description>
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.description}>
			<Form.Label>Description</Form.Label>
			<Form.Input placeholder="Sends the welcome email" autocomplete="off" />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.language}>
			<Form.Label>Language</Form.Label>
			<Form.Select items={languages} defaultValue="typescript" />
			<Form.Errors />
		</Form.Field>

		<Form.Field field={form.fields.requireAuth} orientation="horizontal">
			<Form.Checkbox />
			<Form.Label>Require a signed-in user</Form.Label>
			<Form.Description class="w-full pl-6">
				Only requests with a valid token of an app user reach the function.
			</Form.Description>
		</Form.Field>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>Create function</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
