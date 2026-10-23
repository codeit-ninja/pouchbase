<script lang="ts">
	import { untrack } from 'svelte';
	import * as Button from '#lib/components/ui/button/index.js';
	import type { AnyRemoteFormField } from '#lib/components/ui/form/form-context.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Thumbnail from '#lib/components/ui/thumbnail/index.js';
	import { describeFileTypes, fileFieldRules } from '#lib/files/accept.js';
	import { FILES_COLLECTION, fileUrl, formatFileSize } from '#lib/files/files.js';
	import { listRelationOptions } from './records.remote';
	import { recordHref, type GridField, type GridValue } from './grid';

	type Props = {
		/** A file field, or a single relation field that points to the built-in `files` collection. */
		field: GridField;
		/** `form.fields.values[field.name]` of the record form: the selected file. */
		formField: AnyRemoteFormField;
		/** `form.fields._uploads[field.name]` of the record form: a new file to store and link. */
		uploadField: AnyRemoteFormField;
		/** Current value when editing a record. */
		value: GridValue | undefined;
	};

	let { field, formField, uploadField, value }: Props = $props();

	// The field's types and size limit; relations to `files` accept any file up to the global limit.
	const rules = $derived(fileFieldRules(field.type === 'file' ? field.options : {}));
	const summary = $derived(
		`${describeFileTypes(rules.accept)} up to ${formatFileSize(rules.maxSize)}`
	);

	const refs = $derived(Array.isArray(value) ? value : []);

	// Not awaited, so the field shows right away; until the options are in, the current file is
	// the only choice.
	const options = $derived(
		(field.options.collectionId
			? (listRelationOptions(field.options.collectionId).current ?? refs)
			: refs
		).map((option) => ({
			value: option.id,
			label: option.label,
			description: option.label === option.id ? undefined : option.id,
			// Non-images fail to load as a thumbnail and show the file icon instead.
			image: fileUrl(option.id),
			icon: 'lucide:file'
		}))
	);

	let selected = $state(untrack(() => refs[0]?.id ?? ''));
	const selectedLabel = $derived(
		options.find((option) => option.value === selected)?.label ?? selected
	);
</script>

<div class="flex flex-col gap-3">
	<Form.Field field={formField}>
		<Form.Label class="flex items-center gap-1">
			<span class="font-mono">{field.name}</span>
			{#if field.required}
				<span class="text-red-500" aria-label="required">*</span>
			{/if}
		</Form.Label>

		<div class="flex items-center gap-3">
			<Thumbnail.Root
				src={selected ? fileUrl(selected) : null}
				preview={selected ? fileUrl(selected) : null}
				alt=""
			>
				<Icon.Root icon={selected ? 'lucide:file' : 'lucide:image-off'} />
			</Thumbnail.Root>

			<div class="min-w-0 flex-1">
				<Form.Select
					items={[{ value: '', label: 'None' }, ...options]}
					defaultValue={selected}
					placeholder="Select a file…"
					onValueChange={(next) => (selected = next)}
				/>
			</div>

			{#if selected}
				<Button.Root
					href={recordHref(FILES_COLLECTION, selected)}
					variant="secondary"
					size="icon"
					aria-label="Open {selectedLabel}"
					title="Open {selectedLabel}"
				>
					<Icon.Root icon="lucide:arrow-up-right" />
				</Button.Root>
			{/if}
		</div>

		<Form.Description>
			{field.type === 'file' ? `File · ${summary}` : 'Relation to files'}
		</Form.Description>
		<Form.Errors />
	</Form.Field>

	<Form.Field field={uploadField}>
		<Form.Label class="sr-only">Upload a new file for {field.name}</Form.Label>
		<Form.File
			accept={rules.accept.length ? rules.accept.join(',') : undefined}
			maxSize={rules.maxSize}
			hint={summary}
		/>
		<Form.Description>
			An upload is added to files and replaces the selected file when you save.
		</Form.Description>
		<Form.Errors />
	</Form.Field>
</div>
