<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Sortable from '#lib/components/ui/sortable/index.js';
	import {
		COMPUTED_TRANSFORMS,
		FIELD_TYPES,
		ID_GENERATORS,
		idGenerator,
		isAutoType,
		RELATION_ON_DELETE,
		relationOnDelete
	} from '#lib/fields/field-types.js';
	import { updateFieldsSchema } from '#lib/schemas/fields.js';
	import AddFieldDialog from './add-field-dialog.svelte';
	import EditCollectionIndexes from './edit-collection-indexes.svelte';
	import EditComputedDialog from './edit-computed-dialog.svelte';
	import EditFieldDialog from './edit-field-dialog.svelte';
	import { updateFields } from './fields.remote';
	import type { GridField } from './grid';

	type Props = {
		collection: { id: string; name: string };
		fields: GridField[];
		/** Opens the new field dialog as soon as the sheet is open. */
		newField?: boolean;
		onSaved: () => void;
	};

	let { collection, fields, newField = false, onSaved }: Props = $props();

	const dialogs = Dialog.getDialogs();

	function toRow(field: GridField) {
		return {
			id: field.id,
			name: field.name,
			required: field.required,
			unique: field.unique,
			remove: false
		};
	}

	const form = $derived(updateFields.for(collection.id).preflight(updateFieldsSchema));

	// The form state is the source of truth while editing: inputs are bound to `fields[index]`, so
	// reordering rewrites the array and the edits move along with their rows.
	untrack(() =>
		form.fields.set({
			collection: collection.name,
			fields: fields.map(toRow)
		})
	);

	const byId = $derived(new Map(fields.map((field) => [field.id, field])));
	// Normalized: an unchecked checkbox is stored as `null`, so moved rows keep their state.
	const edited = $derived(
		(form.fields.fields.value() ?? []).map((row) => ({
			id: row?.id ?? '',
			name: row?.name ?? '',
			required: !!row?.required,
			unique: !!row?.unique,
			remove: !!row?.remove
		}))
	);
	// Fields added by the dialog (saved right away) come last; their inputs fall back to the saved
	// values until edited, and the other rows keep their unsaved edits.
	const rows = $derived([
		...edited,
		...fields.filter((field) => !edited.some((row) => row.id === field.id)).map(toRow)
	]);
	const removed = $derived(rows.filter((row) => row.remove).length);

	// Opens on top of the sheet, which stays open behind it.
	function addField() {
		void dialogs.open(AddFieldDialog, { collection, fields });
	}

	// Saved right away, like a new field; the other rows keep their unsaved edits.
	function editComputation(field: GridField) {
		void dialogs.open(EditComputedDialog, { collection, field, fields });
	}

	// Default value and the settings of the type; also saved right away.
	function editSettings(field: GridField) {
		void dialogs.open(EditFieldDialog, { collection, field });
	}

	/** Fields with settings for the edit-field dialog; timestamps have none. */
	function hasSettings(field: GridField) {
		return (
			!field.system &&
			field.type !== 'computed' &&
			field.type !== 'created' &&
			field.type !== 'updated' &&
			field.type !== 'blob'
		);
	}

	onMount(() => {
		if (newField) {
			addField();
		}
	});

	/** The type, plus what sets this field apart, e.g. `Computed · Slug of title`. */
	function describe(field: GridField) {
		const parts: string[] = [FIELD_TYPES[field.type].label];

		if (field.type === 'computed' && field.options.transform) {
			const transform = COMPUTED_TRANSFORMS[field.options.transform].label;

			parts.push(field.options.source ? `${transform} of ${field.options.source}` : transform);
		}

		if (field.type === 'id') {
			parts.push(ID_GENERATORS[idGenerator(field.options)].label);
		}

		if ((field.type === 'relation' || field.type === 'list') && field.options.multiple) {
			parts.push('Multiple');
		}

		if (field.type === 'relation' && relationOnDelete(field.options) !== 'set_null') {
			parts.push(`On delete: ${RELATION_ON_DELETE[relationOnDelete(field.options)].label}`);
		}

		if (field.system) {
			parts.push('Built-in');
		}

		return parts.join(' · ');
	}

	function reorder(from: number, to: number) {
		const next = [...rows];
		const [row] = next.splice(from, 1);

		next.splice(to, 0, row);
		form.fields.fields.set(next);
	}
</script>

<Form.Root
	{form}
	success="Fields saved"
	class="min-h-0 flex-1 gap-0"
	enhance={async (instance) => {
		if (await instance.submit()) {
			onSaved();
		}
	}}
>
	<Form.Hidden field={form.fields.collection} value={collection.name} />

	<Sheet.Body>
		{#if rows.length}
			<Sortable.Root count={rows.length} onReorder={reorder} aria-label="Fields">
				{#snippet header()}
					<!-- Same widths and gaps as the rows below. -->
					<span class="w-6"></span>
					<span class="w-8"></span>
					<span class="flex-1">Field</span>
					<span class="w-16 text-center">Required</span>
					<span class="w-16 text-center">Unique</span>
					<span class="w-16"></span>
				{/snippet}

				{#each rows as row, index (row.id)}
					{@const field = byId.get(row.id)}

					{#if field}
						{@const type = FIELD_TYPES[field.type]}
						{@const locked = field.system || row.remove}
						{@const auto = isAutoType(field.type)}
						{@const canRequire = field.type !== 'computed' && !auto}
						{@const canBeUnique =
							field.type !== 'file' &&
							!auto &&
							!((field.type === 'relation' || field.type === 'list') && field.options.multiple)}

						<Sortable.Item {index} variant={row.remove ? 'danger' : 'default'}>
							<Form.Hidden field={form.fields.fields[index].id} value={row.id} />
							<Form.Hidden field={form.fields.fields[index].remove} value={row.remove} />

							<Sortable.Handle aria-label="Move {field.name}" />
							<Sortable.Icon title={type.label}>
								<Icon.Root icon={type.icon} />
							</Sortable.Icon>

							<div class="flex min-w-0 flex-1 flex-col">
								<Form.Field field={form.fields.fields[index].name} class="gap-0">
									<Form.Label class="sr-only">Name of {field.name}</Form.Label>
									<Form.Input
										variant="ghost"
										defaultValue={field.name}
										readonly={locked}
										autocomplete="off"
										class={[
											'-ml-2 h-7 px-2 font-mono font-medium',
											row.remove && 'text-zinc-500 line-through'
										]}
									/>
									<Form.Errors class="text-xs" />
								</Form.Field>

								{#if row.remove && field.type === 'id'}
									<span class="text-xs text-red-600">
										Deleted with its values when you save; records are then identified by their row
										number
									</span>
								{:else if row.remove}
									<span class="text-xs text-red-600">Deleted with its data when you save</span>
								{:else}
									<span class="truncate text-xs text-zinc-500">{describe(field)}</span>
								{/if}
							</div>

							<div class="flex w-16 justify-center">
								{#if canRequire}
									<Form.Field field={form.fields.fields[index].required} orientation="horizontal">
										<Form.Checkbox defaultChecked={field.required} disabled={locked} />
										<Form.Label class="sr-only">{field.name} is required</Form.Label>
									</Form.Field>
								{:else}
									<span class="text-zinc-300" title="Always filled in automatically">—</span>
								{/if}
							</div>

							<div class="flex w-16 justify-center">
								{#if canBeUnique}
									<Form.Field field={form.fields.fields[index].unique} orientation="horizontal">
										<Form.Checkbox defaultChecked={field.unique} disabled={locked} />
										<Form.Label class="sr-only">{field.name} is unique</Form.Label>
									</Form.Field>
								{:else}
									<span class="text-zinc-300" title="Not available for this field type">—</span>
								{/if}
							</div>

							<div class="flex w-16 shrink-0 justify-end">
								{#if hasSettings(field) && !row.remove}
									<Button.Root
										variant="ghost"
										size="icon"
										aria-label="Edit settings of {field.name}"
										title="Edit settings"
										class="text-zinc-400 hover:text-zinc-900"
										onclick={() => editSettings(field)}
									>
										<Icon.Root icon="lucide:settings-2" />
									</Button.Root>
								{/if}

								{#if field.type === 'computed' && !row.remove}
									<Button.Root
										variant="ghost"
										size="icon"
										aria-label="Edit computation of {field.name}"
										title="Edit computation"
										class="text-zinc-400 hover:text-zinc-900"
										onclick={() => editComputation(field)}
									>
										<Icon.Root icon="lucide:square-function" />
									</Button.Root>
								{/if}

								{#if field.system}
									<span class="flex size-8 shrink-0 items-center justify-center text-zinc-400">
										<Icon.Root icon="lucide:lock" label="Built-in field" class="size-3.5" />
									</span>
								{:else if row.remove}
									<Button.Root
										variant="ghost"
										size="icon"
										aria-label="Keep {field.name}"
										title="Keep"
										onclick={() => form.fields.fields[index].remove.set(false)}
									>
										<Icon.Root icon="lucide:undo-2" />
									</Button.Root>
								{:else}
									<!-- Shown on hover or focus, and always on touch screens. -->
									<Button.Root
										variant="ghost"
										size="icon"
										aria-label="Delete {field.name}"
										title="Delete"
										class="text-zinc-400 opacity-0 group-hover/item:opacity-100 hover:text-red-600 focus-visible:opacity-100 pointer-coarse:opacity-100"
										onclick={() => form.fields.fields[index].remove.set(true)}
									>
										<Icon.Root icon="lucide:trash-2" />
									</Button.Root>
								{/if}
							</div>
						</Sortable.Item>
					{/if}
				{/each}
			</Sortable.Root>

			<Button.Root variant="secondary" class="self-start" onclick={addField}>
				<Icon.Root icon="lucide:plus" />
				New field
			</Button.Root>
		{:else}
			<Empty.Root>
				<Empty.Icon><Icon.Root icon="lucide:columns-3" /></Empty.Icon>
				<Empty.Title>No fields yet</Empty.Title>
				<Empty.Description>Fields are the columns of this collection.</Empty.Description>
				<Button.Root onclick={addField}>
					<Icon.Root icon="lucide:plus" />
					New field
				</Button.Root>
			</Empty.Root>
		{/if}

		<EditCollectionIndexes {collection} {fields} />
	</Sheet.Body>

	<Sheet.Footer>
		{#if removed}
			<p class="mr-auto text-sm text-red-600">
				Saving deletes {removed === 1 ? '1 field' : `${removed} fields`} and their data.
			</p>
		{/if}

		<Sheet.Close>Cancel</Sheet.Close>
		<Form.Submit>Save</Form.Submit>
	</Sheet.Footer>
</Form.Root>
