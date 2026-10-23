<script lang="ts">
	import { MAX_BUNDLE_SIZE } from '@pouchbasejs/plugin-sdk';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Code from '#lib/components/ui/code/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import { uploadBundleSchema } from '#lib/schemas/account.js';
	import { uploadBundle } from './account.remote';

	const form = uploadBundle.preflight(uploadBundleSchema);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Publish a version</Card.Title>
		<Card.Description>
			Upload the bundle that <Code.Root>pouchbase-plugin build</Code.Root> writes to
			<Code.Root>dist/</Code.Root>. The first version of a plugin makes it yours; after that, only
			you can publish new versions.
		</Card.Description>
	</Card.Header>

	<Card.Content>
		<Form.Root
			{form}
			enctype="multipart/form-data"
			enhance={async (instance) => {
				if (await instance.submit()) {
					const result = instance.result;

					if (result) {
						toast.success(`Published ${result.slug}@${result.version}`);
					}

					instance.element.reset();
				}
			}}
		>
			<Form.Field field={form.fields.bundle}>
				<Form.Label>Bundle</Form.Label>
				<Form.File accept=".json,application/json" maxSize={MAX_BUNDLE_SIZE} />
				<Form.Errors />
			</Form.Field>

			<div>
				<Form.Submit>Publish</Form.Submit>
			</div>
		</Form.Root>
	</Card.Content>
</Card.Root>
