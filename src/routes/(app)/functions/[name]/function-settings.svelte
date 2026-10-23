<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { functionSettingsSchema } from '#lib/schemas/functions.js';
	import { getFunction, updateFunction } from '../functions.remote';
	import type { FunctionData } from '../types';
	import DeleteFunctionDialog from './delete-function-dialog.svelte';

	type Props = { fn: FunctionData };

	let { fn }: Props = $props();

	const form = updateFunction.preflight(functionSettingsSchema);

	const dialogs = Dialog.getDialogs();
</script>

<div class="flex flex-col gap-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>Settings</Card.Title>
			<Card.Description>Changes take effect right away, without a deploy.</Card.Description>
		</Card.Header>

		<Card.Content>
			<Form.Root
				{form}
				success="Settings saved"
				enhance={async (instance) => {
					if (await instance.submit()) {
						await getFunction(fn.name).refresh();
					}
				}}
			>
				<Form.Hidden field={form.fields.id} value={fn.id} />

				<Form.Field field={form.fields.description}>
					<Form.Label>Description</Form.Label>
					<Form.Input defaultValue={fn.description} autocomplete="off" />
					<Form.Errors />
				</Form.Field>

				<Form.Field field={form.fields.requireAuth} orientation="horizontal">
					<Form.Checkbox defaultChecked={fn.requireAuth} />
					<Form.Label>Require a signed-in user</Form.Label>
					<Form.Description class="w-full pl-6">
						Requests without a valid token of an app user get <code>401</code> and don't reach the function.
					</Form.Description>
				</Form.Field>

				<div>
					<Form.Submit>Save</Form.Submit>
				</div>
			</Form.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="flex flex-col gap-1.5">
					<Card.Title>Delete function</Card.Title>
					<Card.Description>
						Deletes the Worker on Cloudflare with its secrets, and every version.
					</Card.Description>
				</div>

				<Button.Root
					variant="danger"
					onclick={() => void dialogs.open(DeleteFunctionDialog, { fn })}
				>
					<Icon.Root icon="lucide:trash-2" />
					Delete function
				</Button.Root>
			</div>
		</Card.Header>
	</Card.Root>
</div>
