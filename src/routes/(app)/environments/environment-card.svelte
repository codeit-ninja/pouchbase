<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { getEnvironment } from '#lib/remote/settings.remote.js';
	import { environmentSchema } from '#lib/schemas/environments.js';
	import { updateEnvironment } from './environments.remote';

	const environment = $derived(await getEnvironment());

	const environments = [
		{ value: 'none', label: 'Not set' },
		{ value: 'development', label: 'Development', icon: 'lucide:flask-conical' },
		{ value: 'production', label: 'Production', icon: 'lucide:rocket' }
	];

	const environmentForm = updateEnvironment.preflight(environmentSchema);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>This instance</Card.Title>
	</Card.Header>

	<Card.Content>
		<Form.Root form={environmentForm} success="Environment saved">
			<Form.Field field={environmentForm.fields.environment}>
				<Form.Label>Environment</Form.Label>
				<Form.Select items={environments} defaultValue={environment ?? 'none'} />
				<Form.Description>
					Shown in the sidebar, so you always know which instance you are working on.
				</Form.Description>
				<Form.Errors />
			</Form.Field>

			<div class="flex justify-end">
				<Form.Submit>Save</Form.Submit>
			</div>
		</Form.Root>
	</Card.Content>
</Card.Root>
