<script lang="ts">
	import { untrack } from 'svelte';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import type { AnyRemoteFormField } from '#lib/components/ui/form/form-context.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import {
		COMPUTED_TRANSFORMS,
		FIELD_TYPES,
		listSelection,
		NOW_DEFAULT
	} from '#lib/fields/field-types.js';
	import { listRelationOptions } from './records.remote';
	import { recordHref, type GridField, type GridValue } from './grid';

	type Props = {
		field: GridField;
		/** `form.fields.values[field.name]` of the record form. */
		formField: AnyRemoteFormField;
		/** Current value when editing a record. */
		value: GridValue | undefined;
		/** Name of the collection a relation field points to, for links to the related records. */
		relationTarget?: string;
	};

	let { field, formField, value, relationTarget }: Props = $props();

	const relationRefs = $derived(Array.isArray(value) ? value : []);
	// A new record starts with the field's default; a saved record with its own selection.
	const relationIds = $derived(
		value === undefined && field.type === 'relation' && field.defaultValue
			? [field.defaultValue]
			: relationRefs.map((ref) => ref.id)
	);

	// Not awaited, so the field shows right away; until the options are in, the current
	// selection is the only choice.
	const options = $derived(
		(field.type === 'relation' && field.options.collectionId
			? (listRelationOptions(field.options.collectionId).current ?? relationRefs)
			: []
		).map((option) => ({
			value: option.id,
			label: option.label,
			description: option.label === option.id ? undefined : option.id
		}))
	);

	// The records selected right now, so the links follow the selection before it's saved.
	let relationSelected = $state(untrack(() => relationIds));
	const relationLinks = $derived(
		relationTarget
			? relationSelected.map((id) => ({
					id,
					label: options.find((option) => option.value === id)?.label ?? id,
					href: recordHref(relationTarget, id)
				}))
			: []
	);

	const listItems = $derived(
		(field.options.values ?? []).map((item) => ({ value: item, label: item }))
	);

	// A new record starts with the field's default; a saved record with its own selection.
	const listSelected = $derived(
		value === undefined
			? field.defaultValue
				? [field.defaultValue]
				: []
			: listSelection(value, field.options.multiple)
	);

	const text = $derived(value === null || value === undefined ? undefined : String(value));

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

		{#if field.type === 'computed'}
			<!-- Disabled, so it isn't submitted: the server calculates the value on save. -->
			<Form.Input defaultValue={text} placeholder="Calculated on save" disabled />
		{:else if field.type === 'rich_text'}
			<Form.RichText format={field.options.format ?? 'html'} defaultValue={text ?? ''} />
		{:else if field.type === 'json'}
			<Form.Code language="json" class="h-48" defaultValue={text ? prettyJson(text) : ''} />
		{:else if field.type === 'number' || field.type === 'integer'}
			<Form.Input
				type="number"
				step={field.type === 'integer' ? '1' : 'any'}
				defaultValue={text}
				placeholder={field.defaultValue ?? undefined}
			/>
		{:else if field.type === 'date'}
			<Form.DatePicker defaultValue={text} required={field.required} />
		{:else if field.type === 'email'}
			<Form.Input type="email" defaultValue={text} placeholder="name@example.com" />
		{:else if field.type === 'url'}
			<Form.Input type="url" defaultValue={text} placeholder="https://example.com" />
		{:else if field.type === 'relation' && field.options.multiple}
			<Form.MultiSelect
				items={options}
				defaultValue={relationIds}
				placeholder="Select records…"
				onValueChange={(next) => (relationSelected = next)}
			/>

			{#if relationLinks.length}
				<div class="flex flex-wrap gap-1">
					{#each relationLinks as link (link.id)}
						<Badge.Root href={link.href} title="Open {link.label}">
							{link.label}
							<Icon.Root icon="lucide:arrow-up-right" />
						</Badge.Root>
					{/each}
				</div>
			{/if}
		{:else if field.type === 'relation'}
			<div class="flex items-center gap-2">
				<div class="min-w-0 flex-1">
					<Form.Select
						items={[{ value: '', label: 'None' }, ...options]}
						defaultValue={relationIds[0] ?? ''}
						placeholder="Select a record…"
						onValueChange={(next) => (relationSelected = next ? [next] : [])}
					/>
				</div>

				{#if relationLinks[0]}
					<Button.Root
						href={relationLinks[0].href}
						variant="secondary"
						size="icon"
						aria-label="Open {relationLinks[0].label}"
						title="Open {relationLinks[0].label}"
					>
						<Icon.Root icon="lucide:arrow-up-right" />
					</Button.Root>
				{/if}
			</div>
		{:else if field.type === 'list' && field.options.multiple}
			<Form.MultiSelect items={listItems} defaultValue={listSelected} placeholder="Select items…" />
		{:else if field.type === 'list'}
			<Form.Select
				items={[{ value: '', label: 'None' }, ...listItems]}
				defaultValue={listSelected[0] ?? ''}
				placeholder="Select an item…"
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
			{#if field.type === 'computed' && field.options.transform === 'script'}
				Calculated by a script, updated when you save
			{:else if field.type === 'computed' && field.options.transform}
				{COMPUTED_TRANSFORMS[field.options.transform].label} of
				<span class="font-mono">{field.options.source}</span>, updated when you save
			{:else}
				{FIELD_TYPES[field.type].label}{field.type === 'date' ? ' (UTC)' : ''}{field.defaultValue
					? ` · defaults to ${field.defaultValue === NOW_DEFAULT ? 'the time it is created' : (options.find((option) => option.value === field.defaultValue)?.label ?? field.defaultValue)}`
					: ''}
			{/if}
		</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}
