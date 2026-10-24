<script lang="ts">
	import type { AnyRemoteFormField } from '#lib/components/ui/form/form-context.js';
	import type { FieldType, RichTextFormat } from '#lib/fields/field-types.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import {
		FIELD_TYPES,
		ID_GENERATOR_IDS,
		ID_GENERATORS,
		idGenerator,
		MAX_LIST_VALUE_LENGTH,
		MAX_LIST_VALUES,
		NOW_DEFAULT,
		parseListValues,
		RELATION_ON_DELETE,
		RELATION_ON_DELETE_IDS,
		relationOnDelete
	} from '#lib/fields/field-types.js';
	import { SQL_DEFAULT_TYPES } from '#lib/fields/sql-expression.js';
	import { FILE_TYPE_PRESET_IDS, FILE_TYPE_PRESETS, splitFileTypes } from '#lib/files/accept.js';
	import { MAX_FILE_SIZE_MB } from '#lib/schemas/fields.js';
	import type { GridField } from './grid';
	import { listRelationOptions } from './records.remote';
	import { SQL_COMPLETIONS } from './sql-completions';

	type Props = {
		type: FieldType;
		/** The settings fields of the surrounding remote form (add field or edit field). */
		formFields: {
			idGenerator: AnyRemoteFormField;
			defaultValue: AnyRemoteFormField;
			defaultSql: AnyRemoteFormField;
			format: AnyRemoteFormField;
			multiple: AnyRemoteFormField;
			onDelete: AnyRemoteFormField;
			listValues: AnyRemoteFormField;
			fileTypes: AnyRemoteFormField;
			customFileTypes: AnyRemoteFormField;
			maxFileSize: AnyRemoteFormField;
		};
		/** The field being edited: its settings are the starting values. Leave out for a new field. */
		field?: GridField;
		/** Relation fields: id of the related collection, whose records can be the default value. */
		relationCollectionId?: string;
	};

	let { type, formFields, field, relationCollectionId }: Props = $props();

	const MB = 1024 * 1024;

	// Starting values: the field's current settings, or the defaults of a new field.
	const initial = $derived.by(() => {
		const options = field?.options ?? {};
		const fileTypes = splitFileTypes(options.accept ?? []);

		return {
			generator: field ? idGenerator(options) : undefined,
			format: options.format ?? 'html',
			multiple: !!options.multiple,
			onDelete: relationOnDelete(options),
			listValues: options.values ?? [],
			fileTypes: fileTypes.presets,
			customFileTypes: fileTypes.custom.join(', '),
			maxFileSize: options.maxSize ? String(Math.round((options.maxSize / MB) * 100) / 100) : '',
			defaultValue: field?.defaultValue ?? '',
			defaultSql: !!options.defaultSql
		};
	});

	// `value()` stays undefined until the control is changed, so fall back to the starting values.
	const format = $derived(
		(formFields.format.value() as RichTextFormat | undefined) ?? initial.format
	);
	const useSql = $derived(
		((formFields.defaultSql.value() as boolean | undefined) ?? initial.defaultSql) &&
			SQL_DEFAULT_TYPES.has(type)
	);
	const listItems = $derived(
		(formFields.listValues.value() === undefined
			? initial.listValues
			: parseListValues(formFields.listValues.value() as string)
		).map((item) => ({ value: item, label: item }))
	);

	// An auto-increment id is an integer column; the other generators make text, so an existing
	// id field can only switch between those.
	const generatorItems = $derived(
		ID_GENERATOR_IDS.filter(
			(id) => !field || (id === 'autoincrement') === (initial.generator === 'autoincrement')
		).map((id) => ({
			value: id,
			label: ID_GENERATORS[id].label,
			description: ID_GENERATORS[id].description
		}))
	);

	// Not awaited, so the dialog opens right away; until the records are in, only the current
	// default can be chosen.
	const relationItems = $derived.by(() => {
		const collectionId = relationCollectionId ?? field?.options.collectionId;
		const records = collectionId ? listRelationOptions(collectionId).current : undefined;
		const items: { value: string; label: string; description?: string }[] = (records ?? []).map(
			(record) => ({
				value: record.id,
				label: record.label,
				description: record.label === record.id ? undefined : record.id
			})
		);

		if (initial.defaultValue && !items.some((item) => item.value === initial.defaultValue)) {
			items.unshift({ value: initial.defaultValue, label: initial.defaultValue });
		}

		return items;
	});

	const onDeleteItems = RELATION_ON_DELETE_IDS.map((id) => ({
		value: id,
		label: RELATION_ON_DELETE[id].label,
		description: RELATION_ON_DELETE[id].description
	}));

	const fileTypeItems = FILE_TYPE_PRESET_IDS.map((id) => ({
		value: id,
		label: FILE_TYPE_PRESETS[id].label,
		description:
			FILE_TYPE_PRESETS[id].rules.length === 1 ? FILE_TYPE_PRESETS[id].rules[0] : undefined
	}));

	const formatItems = [
		{ value: 'html', label: 'HTML', description: 'Stored as HTML markup.' },
		{ value: 'markdown', label: 'Markdown', description: 'Stored as Markdown text.' }
	];

	const booleanItems = [
		{ value: '', label: 'None' },
		{ value: 'true', label: 'True' },
		{ value: 'false', label: 'False' }
	];

	const sqlPlaceholders: Partial<Record<FieldType, string>> = {
		date: "datetime('now', '+7 days')",
		number: 'random() % 100',
		integer: "unixepoch('now')",
		json: "json_object('created', datetime('now'))"
	};

	const defaultPlaceholders: Partial<Record<FieldType, string>> = {
		number: '0.5',
		integer: '0',
		date: '2026-01-31',
		email: 'name@example.com',
		url: 'https://example.com',
		json: '{"key": "value"}'
	};
</script>

{#if type === 'id'}
	<Form.Field field={formFields.idGenerator}>
		<Form.Label>Generator</Form.Label>
		<Form.Select
			items={generatorItems}
			defaultValue={initial.generator}
			placeholder="Choose a generator…"
		/>
		<Form.Description>
			{#if field}
				How the id of a new record is made; existing ids stay as they are.
			{:else}
				How the id of a new record is made. Existing records get one right away.
			{/if}
		</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}

{#if type === 'rich_text'}
	<Form.Field field={formFields.format}>
		<Form.Label>Store as</Form.Label>
		<Form.Select items={formatItems} defaultValue={initial.format} />
		{#if field}
			<Form.Description>Existing content isn't converted.</Form.Description>
		{/if}
		<Form.Errors />
	</Form.Field>
{/if}

{#if type === 'list'}
	<Form.Field field={formFields.listValues}>
		<Form.Label>Items</Form.Label>
		<Form.ItemList
			defaultValue={initial.listValues}
			placeholder="e.g. Draft"
			max={MAX_LIST_VALUES}
			maxLength={MAX_LIST_VALUE_LENGTH}
		/>
		<Form.Description>
			Records pick from these items. Press Enter to add one, paste several lines to add them all,
			and drag to change the order.
			{#if field}
				Items that records use can't be removed.
			{/if}
		</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}

{#if type === 'relation' || type === 'list'}
	<Form.Field field={formFields.multiple} orientation="horizontal">
		<Form.Checkbox defaultChecked={initial.multiple} />
		<Form.Label>Allow multiple</Form.Label>
		<Form.Description class="w-full pl-6">
			{type === 'relation'
				? 'Link several records instead of one; stored as a JSON array of ids.'
				: 'Pick several items instead of one; stored as a JSON array.'}
			{#if field}
				Existing values are converted when you save.
			{/if}
		</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}

{#if type === 'relation'}
	<Form.Field field={formFields.onDelete}>
		<Form.Label>When a linked record is deleted</Form.Label>
		<Form.Select items={onDeleteItems} defaultValue={initial.onDelete} />
		<Form.Description>
			What happens to records of this collection that link to a record when it is deleted.
		</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}

{#if type === 'file'}
	<Form.Field field={formFields.fileTypes}>
		<Form.Label>File types</Form.Label>
		<Form.MultiSelect
			items={fileTypeItems}
			defaultValue={initial.fileTypes}
			placeholder="Any file"
		/>
		<Form.Description>
			Uploads from the record form are stored in <span class="font-mono">files</span> and linked here.
			Leave empty to accept any file.
		</Form.Description>
		<Form.Errors />
	</Form.Field>

	<Form.Field field={formFields.customFileTypes}>
		<Form.Label>Other types</Form.Label>
		<Form.Input
			defaultValue={initial.customFileTypes}
			placeholder="application/json, .md"
			autocomplete="off"
		/>
		<Form.Description>MIME types or extensions, separated by commas.</Form.Description>
		<Form.Errors />
	</Form.Field>

	<Form.Field field={formFields.maxFileSize}>
		<Form.Label>Max file size (MB)</Form.Label>
		<Form.Input
			type="number"
			step="any"
			defaultValue={initial.maxFileSize}
			placeholder={String(MAX_FILE_SIZE_MB)}
		/>
		<Form.Description>At most {MAX_FILE_SIZE_MB} MB, the limit for every upload.</Form.Description>
		<Form.Errors />
	</Form.Field>
{/if}

{#if FIELD_TYPES[type].defaultable}
	<Form.Field field={formFields.defaultValue}>
		<Form.Label>Default value</Form.Label>

		{#if useSql}
			<Form.Code
				language="sql"
				completions={SQL_COMPLETIONS}
				lineNumbers={false}
				defaultValue={initial.defaultSql ? initial.defaultValue : ''}
				placeholder={sqlPlaceholders[type] ?? 'lower(hex(randomblob(4)))'}
				class="h-20"
			/>
		{:else if type === 'rich_text'}
			{#key format}
				<Form.RichText {format} defaultValue={initial.defaultValue} placeholder="Optional" />
			{/key}
		{:else if type === 'list'}
			<Form.Select
				items={[{ value: '', label: 'None' }, ...listItems]}
				defaultValue={initial.defaultValue}
			/>
		{:else if type === 'relation'}
			{#key relationCollectionId}
				<Form.Select
					items={[{ value: '', label: 'None' }, ...relationItems]}
					defaultValue={initial.defaultValue}
					placeholder="Select a record…"
				/>
			{/key}
		{:else if type === 'boolean'}
			<Form.Select items={booleanItems} defaultValue={initial.defaultValue} />
		{:else}
			<Form.Input
				defaultValue={initial.defaultSql ? '' : initial.defaultValue}
				placeholder={defaultPlaceholders[type] ?? 'Optional'}
				autocomplete="off"
			/>
		{/if}

		<Form.Description>
			{#if useSql}
				A SQLite expression, run when a record is created, with SQLite's date, time, text, math and
				JSON functions.
				{#if type === 'date'}
					It must give a date and time, e.g. <span class="font-mono">date('now', '+1 day')</span>;
					stored in UTC.
				{/if}
			{:else if type === 'relation'}
				New records link to this record when they don't set this field. It can't be deleted while it
				is the default.
			{:else}
				Used when a record doesn't set this field.
				{#if type === 'date'}
					Enter <span class="font-mono">{NOW_DEFAULT}</span> for the time the record is created.
				{/if}
			{/if}
			{#if field}
				Only new records get it.
			{/if}
		</Form.Description>
		<Form.Errors />
	</Form.Field>

	{#if SQL_DEFAULT_TYPES.has(type)}
		<Form.Field field={formFields.defaultSql} orientation="horizontal">
			<Form.Checkbox defaultChecked={initial.defaultSql} />
			<Form.Label>SQL expression</Form.Label>
			<Form.Description class="w-full pl-6">
				Calculate the default value with SQLite functions, e.g.
				<span class="font-mono">datetime('now')</span>.
			</Form.Description>
		</Form.Field>
	{/if}
{/if}
