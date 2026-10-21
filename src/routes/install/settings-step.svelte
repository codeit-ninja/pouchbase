<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { settingsSchema } from '#lib/schemas/install.js';
	import { saveSettings } from './install.remote';

	const form = saveSettings.preflight(settingsSchema);
</script>

<Card.Header>
	<Card.Title>App settings</Card.Title>
	<Card.Description>You can change these settings later.</Card.Description>
</Card.Header>

<Card.Content>
	<Form.Root {form} oninput={() => form.validate()}>
		<Form.Field field={form.fields.appName}>
			<Form.Label>App name</Form.Label>
			<Form.Input placeholder="Pouchbase" />
			<Form.Errors />
		</Form.Field>

		<Form.Submit>Finish installation</Form.Submit>
	</Form.Root>
</Card.Content>
