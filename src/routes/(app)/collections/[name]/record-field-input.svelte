<script lang="ts">
	import type { AnyRemoteFormField } from '#lib/components/ui/form/form-context.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { FIELD_TYPES } from '#lib/fields/field-types.js';
	import { listRelationOptions } from './records.remote';
	import type { GridField, GridValue } from './grid';

	type Props = {
		field: GridField;
		/** `form.fields.values[field.name]` of the record form. */
		formField: AnyRemoteFormField;
		/** Current value when editing a record. */
		value: GridValue | undefined;
	};

	let { field, formField, value }: Props = $props();

	const options = $derived(
		field.type === 'relation' && field.options.collectionId
			? (await listRelationOptions(field.options.collectionId)).map((option) => ({
					value: option.id,
					label: option.label,
					description: option.label === option.id ? undefined : option.id
				}))
			: []
	);

	const text = $derived(value === null || value === undefined ? undefined : String(value));
	const relationIds = $derived(Array.isArray(value) ? value.map((ref) => ref.id) : []);

	function prettyJson(json: string) {
		try {
			return JSON.stringify(JSON.parse(json), null, 2);
		} catch {
			return json;
		}
	}
</script>

{#if field.type === 'boolean'}
	<Form.Field field={formField} orientation="horizontal">
		<Form.Checkbox defaultChecked={value === 1} />
		<Form.Label class="font-mono">{field.name}</Form.Label>
		<Form.Errors class="w-full" />
	</Form.Field>
{:else}
	<Form.Field field={formField}>
		<Form.Label class="flex items-center gap-1">
			<span class="font-mono">{field.name}</span>
			{#if field.required}
				<span class="text-red-500" aria-label="required">*</span>
			{/if}
		</Form.Label>

		{#if field.type === 'rich_text'}
			<Form.RichText format={field.options.format ?? 'html'} defaultValue={text ?? ''} />
		{:else if field.type === 'json'}
			<Form.Textarea
				class="font-mono"
				defaultValue={text ? prettyJson(text) : ''}
				placeholder={'{"key": "value"}'}
			/>
		{:else if field.type === 'number' || field.type === 'integer'}
			<Form.Input
				type="number"
				step={field.type === 'integer' ? '1' : 'any'}
				defaultValue={text}
				placeholder={field.defaultValue ?? undefined}
			/>
		{:else if field.type === 'date'}
			<Form.Input type="datetime-local" defaultValue={text?.slice(0, 16)} />
		{:else if field.type === 'email'}
			<Form.Input type="email" defaultValue={text} placeholder="name@example.com" />
		{:else if field.type === 'url'}
			<Form.Input type="url" defaultValue={text} placeholder="https://example.com" />
		{:else if field.type === 'relation' && field.options.multiple}
			<Form.MultiSelect items={options} defaultValue={relationIds} placeholder="Select records…" />
		{:else if field.type === 'relation'}
			<Form.Select
				items={[{ value: '', label: 'None' }, ...options]}
				defaultValue={relationIds[0] ?? ''}
				placeholder="Select a record…"
			/>
		{:else if field.type === 'blob'}
			<p class="text-sm text-zinc-500">
				{text ? `${text} bytes of binary data.` : 'No data.'} Binary data can't be edited here yet.
			</p>
		{:else}
			<Form.Input
				defaultValue={text}
				placeholder={field.defaultValue ?? undefined}
				autocomplete="off"
			/>
		{/if}

		<Form.Description>
			{FIELD_TYPES[field.type].label}{field.type === 'date' ? ' (UTC)' : ''}{field.defaultValue
				? ` · defaults to ${field.defaultValue}`
				: ''}
		</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}
