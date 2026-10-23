<script module lang="ts">
	export type Props = {
		/** The items, in order. */
		value?: string[];
		/** Placeholder of the input that adds an item. */
		placeholder?: string;
		/** Used in labels, e.g. "Delete item Draft". */
		itemLabel?: string;
		/** Most items the list can have; the add input is disabled at the limit. */
		max?: number;
		/** Longest item, in characters. */
		maxLength?: number;
		/** Id of the add input, so a label can point to it. */
		id?: string;
		disabled?: boolean;
		class?: string;
		onValueChange?: (value: string[]) => void;
		'aria-invalid'?: boolean | 'true' | 'false';
		'aria-describedby'?: string;
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import * as Button from '../../button/index.js';
	import * as Icon from '../../icon/index.js';
	import * as Sortable from '../../sortable/index.js';
	import * as Input from '../input/index.js';

	let {
		value = $bindable([]),
		placeholder = 'Add an item…',
		itemLabel = 'item',
		max,
		maxLength,
		id,
		disabled = false,
		class: className,
		onValueChange,
		...aria
	}: Props = $props();

	// Rows get their own id, so editing an item into a duplicate doesn't break the keyed list.
	let rows = $state(untrack(() => value.map((text) => ({ id: crypto.randomUUID(), text }))));
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);

	const full = $derived(max !== undefined && rows.length >= max);
	const duplicate = $derived(
		draft.trim() !== '' && rows.some((row) => row.text.trim() === draft.trim())
	);

	function commit() {
		value = rows.map((row) => row.text);
		onValueChange?.(value);
	}

	/** Adds each line of `text` that isn't in the list yet, so a pasted list becomes several items. */
	function add(text: string) {
		const existing = rows.map((row) => row.text.trim());
		const lines: string[] = [];

		for (const line of text.split(/\r?\n/).map((line) => line.trim())) {
			if (line && !existing.includes(line) && !lines.includes(line)) {
				lines.push(line);
			}
		}

		if (!lines.length) {
			return false;
		}

		const room = max === undefined ? lines.length : Math.max(max - rows.length, 0);

		rows.push(...lines.slice(0, room).map((line) => ({ id: crypto.randomUUID(), text: line })));
		commit();

		return true;
	}

	function submitDraft() {
		if (add(draft)) {
			draft = '';
		}

		input?.focus();
	}

	function remove(index: number) {
		rows.splice(index, 1);
		commit();
	}

	function reorder(from: number, to: number) {
		const [row] = rows.splice(from, 1);

		rows.splice(to, 0, row);
		commit();
	}
</script>

<div class={['flex flex-col gap-2', className]}>
	{#if rows.length}
		<Sortable.Root count={rows.length} onReorder={reorder} aria-label="Items">
			{#each rows as row, index (row.id)}
				<Sortable.Item {index} class="gap-2 py-1 pl-2">
					<Sortable.Handle aria-label="Move {itemLabel} {row.text}" {disabled} />

					<Input.Root
						variant="ghost"
						class="flex-1"
						bind:value={row.text}
						maxlength={maxLength}
						aria-label="{itemLabel} {index + 1}"
						{disabled}
						oninput={commit}
						onblur={() => {
							// An item emptied while editing is removed.
							if (!row.text.trim()) {
								remove(index);
							}
						}}
					/>

					<!-- Shown on hover or focus, and always on touch screens. -->
					<Button.Root
						variant="ghost"
						size="icon"
						aria-label="Delete {itemLabel} {row.text}"
						title="Delete"
						class="text-zinc-400 opacity-0 group-hover/item:opacity-100 hover:text-red-600 focus-visible:opacity-100 pointer-coarse:opacity-100"
						{disabled}
						onclick={() => remove(index)}
					>
						<Icon.Root icon="lucide:x" />
					</Button.Root>
				</Sortable.Item>
			{/each}
		</Sortable.Root>
	{/if}

	<div class="flex gap-2">
		<Input.Root
			bind:ref={input}
			bind:value={draft}
			{id}
			class="flex-1"
			placeholder={full ? `At most ${max} ${itemLabel}s` : placeholder}
			autocomplete="off"
			maxlength={maxLength}
			disabled={disabled || full}
			{...aria}
			onkeydown={(event) => {
				// Enter adds the item instead of submitting the form.
				if (event.key === 'Enter') {
					event.preventDefault();
					submitDraft();
				}
			}}
			onpaste={(event) => {
				const text = event.clipboardData?.getData('text') ?? '';

				if (text.includes('\n')) {
					event.preventDefault();
					add(text);
				}
			}}
		/>

		<Button.Root
			variant="secondary"
			disabled={disabled || full || !draft.trim() || duplicate}
			onclick={submitDraft}
		>
			<Icon.Root icon="lucide:plus" />
			Add
		</Button.Root>
	</div>

	{#if duplicate}
		<p class="text-xs text-zinc-500">This {itemLabel} is already in the list.</p>
	{/if}
</div>
