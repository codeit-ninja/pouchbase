<script lang="ts">
	import type { AnyRemoteFormField } from '#lib/components/ui/form/form-context.js';
	import type { ComputedTransform } from '#lib/fields/field-types.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import {
		COMPUTED_SOURCE_TYPES,
		COMPUTED_TRANSFORM_IDS,
		COMPUTED_TRANSFORMS,
		FIELD_TYPES,
		hasComputedSource,
		SCRIPT_TEMPLATE
	} from '#lib/fields/field-types.js';
	import { previewComputed } from './fields.remote';
	import type { GridField } from './grid';
	import { scriptTypings } from './script-typings';

	type Props = {
		collection: { name: string };
		/** Every field of the collection: sources to choose from and what a script can read. */
		fields: GridField[];
		/** The computed field being edited; it can't be its own source. */
		field?: GridField;
		/** The compute fields of the surrounding remote form. */
		formFields: {
			computeSource: AnyRemoteFormField;
			computeTransform: AnyRemoteFormField;
			computeScript: AnyRemoteFormField;
		};
		/** Current settings, when editing a computed field. */
		initial?: { transform?: ComputedTransform; source?: string; script?: string };
	};

	let { collection, fields, field: self, formFields, initial }: Props = $props();

	const typings = $derived(scriptTypings(collection.name, fields));

	// `value()` stays undefined until a control is changed, so fall back to the initial values.
	const transform = $derived(
		(formFields.computeTransform.value() as ComputedTransform | undefined) ??
			initial?.transform ??
			'slug'
	);
	const source = $derived(
		(formFields.computeSource.value() as string | undefined) ?? initial?.source ?? ''
	);
	const script = $derived(
		(formFields.computeScript.value() as string | undefined) ?? initial?.script ?? SCRIPT_TEMPLATE
	);

	const sourceItems = $derived(
		fields
			.filter((field) => field.id !== self?.id && COMPUTED_SOURCE_TYPES.has(field.type))
			.map((field) => ({
				value: field.name,
				label: field.name,
				description: FIELD_TYPES[field.type].label,
				icon: FIELD_TYPES[field.type].icon
			}))
	);

	const transformItems = COMPUTED_TRANSFORM_IDS.map((id) => ({
		value: id,
		label: COMPUTED_TRANSFORMS[id].label,
		description: COMPUTED_TRANSFORMS[id].description
	}));

	let preview = $state<Awaited<ReturnType<typeof previewComputed>> | null>(null);

	async function runPreview() {
		preview = await previewComputed({
			collection: collection.name,
			computeTransform: transform,
			computeSource: source || undefined,
			computeScript: script
		});
	}
</script>

<Form.Field field={formFields.computeTransform}>
	<Form.Label>Compute as</Form.Label>
	<Form.Select
		items={transformItems}
		defaultValue={initial?.transform ?? 'slug'}
		onValueChange={() => (preview = null)}
	/>
	<Form.Errors />
</Form.Field>

{#if hasComputedSource(transform)}
	<Form.Field field={formFields.computeSource}>
		<Form.Label>Computed from</Form.Label>
		<Form.Select
			items={sourceItems}
			defaultValue={initial?.source}
			placeholder={sourceItems.length ? 'Choose a field…' : 'No text, number or date fields'}
		/>
		<Form.Description>Recalculated whenever a record is saved.</Form.Description>
		<Form.Errors />
	</Form.Field>
{:else}
	<Form.Field field={formFields.computeScript}>
		<Form.Label>Script</Form.Label>
		<Form.Code
			class="h-72"
			defaultValue={initial?.script ?? SCRIPT_TEMPLATE}
			{typings}
			allowReturn
		/>
		<Form.Description>
			JavaScript that returns the value, with <span class="font-mono">record</span> and
			<span class="font-mono">ctx</span> available; press Ctrl+Space for suggestions. It runs in a sandbox
			for at most 100 ms, without network or database access, whenever a record is saved.
		</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}

<div class="flex flex-col gap-2">
	<Button.Root type="button" variant="secondary" class="self-start" onclick={runPreview}>
		<Icon.Root icon="lucide:play" />
		Try on recent records
	</Button.Root>

	{#if preview}
		{#if preview.error}
			<p role="alert" class="font-mono text-xs whitespace-pre-wrap text-red-600">
				{preview.error}
			</p>
		{:else}
			<Table.Root>
				<Table.Body>
					{#each preview.rows as row (row.id)}
						<Table.Row>
							<Table.Cell class="font-mono text-xs text-zinc-500">{row.id}</Table.Cell>
							<Table.Cell class="font-mono text-xs">
								{#if row.error}
									<span class="text-red-600">{row.error}</span>
								{:else if row.value === null || row.value === undefined}
									<span class="text-zinc-400 italic">NULL</span>
								{:else}
									{row.value}
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell class="text-zinc-500">No records to try it on yet.</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	{/if}
</div>
