<script module lang="ts">
	import type { Item } from '../select/index.js';

	export type Props = {
		items: Item[];
		value?: string;
		/** Name of the hidden input, so the value is submitted with a form. */
		name?: string;
		placeholder?: string;
		id?: string;
		disabled?: boolean;
		/** Shows a spinner in the field, e.g. while `items` are fetched for a search. */
		loading?: boolean;
		/** Shown in the list when no item matches. */
		emptyText?: string;
		class?: string;
		onValueChange?: (value: string) => void;
		/**
		 * Called with the typed text, to search on the server; `items` should then only hold the
		 * matches. Without it, `items` are filtered here by their label.
		 */
		onSearchChange?: (search: string) => void;
		'aria-invalid'?: boolean | 'true' | 'false';
		'aria-describedby'?: string;
		'aria-labelledby'?: string;
		/** For a combobox without a visible label. */
		'aria-label'?: string;
	};
</script>

<script lang="ts">
	import { Combobox } from 'bits-ui';
	import * as Icon from '../../icon';
	import * as ScrollArea from '../../scroll-area/index.js';
	import * as Spinner from '../../spinner/index.js';
	import * as Thumbnail from '../../thumbnail/index.js';

	let {
		items,
		value = $bindable(''),
		name,
		placeholder = 'Search…',
		id,
		disabled = false,
		loading = false,
		emptyText = 'No matches',
		class: className,
		onValueChange,
		onSearchChange,
		...aria
	}: Props = $props();

	let open = $state(false);
	let anchor = $state<HTMLElement | null>(null);
	let search = $state('');

	// The selected item as last listed, so the field keeps showing it when a search no longer
	// lists it. Not reactive: it only caches what `items` held.
	let lastSelected: Item | undefined;

	const selected = $derived.by(() => {
		const found = items.find((item) => item.value === value);

		if (found) {
			lastSelected = found;
		}

		return found ?? (lastSelected?.value === value ? lastSelected : undefined);
	});

	const shown = $derived.by(() => {
		const query = search.trim().toLowerCase();

		return onSearchChange || !query
			? items
			: items.filter((item) => item.label.toLowerCase().includes(query));
	});

	function setSearch(next: string) {
		search = next;
		onSearchChange?.(next);
	}
</script>

<Combobox.Root
	type="single"
	bind:value
	bind:open
	{name}
	{disabled}
	inputValue={open ? search : (selected?.label ?? '')}
	items={items.map(({ value, label, disabled }) => ({ value, label, disabled }))}
	{onValueChange}
	onOpenChange={(next) => {
		if (!next && search) {
			setSearch('');
		}
	}}
>
	<div
		bind:this={anchor}
		class={[
			'flex h-control w-full items-center gap-2 rounded-md border border-zinc-300 bg-white pr-1 pl-3 text-sm shadow-xs has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50 has-[input:focus-visible]:border-zinc-900 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-zinc-900/10 has-[input[aria-invalid=true]]:border-red-500',
			className
		]}
	>
		{#if selected?.image && !open}
			<Thumbnail.Root src={selected.image} size="sm">
				{#if selected.icon}
					<Icon.Root icon={selected.icon} />
				{/if}
			</Thumbnail.Root>
		{:else}
			<Icon.Root icon="lucide:search" class="size-4 shrink-0 text-zinc-400" />
		{/if}

		<Combobox.Input
			{id}
			{...aria}
			{placeholder}
			autocomplete="off"
			oninput={(event) => setSearch(event.currentTarget.value)}
			class="h-full min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
		/>

		{#if loading}
			<Spinner.Root class="text-zinc-400" />
		{/if}

		<Combobox.Trigger
			aria-label="Show options"
			class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed"
		>
			<Icon.Root icon="lucide:chevrons-up-down" class="size-4" />
		</Combobox.Trigger>
	</div>

	<Combobox.Portal>
		<Combobox.Content
			sideOffset={4}
			customAnchor={anchor}
			class="z-50 max-h-(--bits-combobox-content-available-height) w-(--bits-combobox-anchor-width) min-w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg outline-none"
		>
			<!-- At most 18rem high, so long lists scroll instead of filling the screen. -->
			<ScrollArea.Root
				type="auto"
				viewportClass="max-h-[min(18rem,calc(var(--bits-combobox-content-available-height)-2px))]"
			>
				<Combobox.Viewport class="p-1.5">
					{#each shown as item (item.value)}
						<Combobox.Item
							value={item.value}
							label={item.label}
							disabled={item.disabled}
							class="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-700 outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-zinc-100 data-highlighted:text-zinc-900"
						>
							{#snippet children({ selected: isSelected })}
								{#if item.image}
									<Thumbnail.Root src={item.image} size="md">
										{#if item.icon}
											<Icon.Root icon={item.icon} />
										{/if}
									</Thumbnail.Root>
								{:else if item.icon}
									<Icon.Root icon={item.icon} class="size-4 text-zinc-500" />
								{/if}

								<span class="flex min-w-0 flex-1 flex-col">
									<span class="truncate">{item.label}</span>

									{#if item.description}
										<span class="truncate text-xs text-zinc-500">{item.description}</span>
									{/if}
								</span>

								{#if isSelected}
									<Icon.Root icon="lucide:check" class="size-4 text-zinc-900" />
								{/if}
							{/snippet}
						</Combobox.Item>
					{:else}
						<p class="px-3 py-2 text-sm text-zinc-500">{loading ? 'Searching…' : emptyText}</p>
					{/each}
				</Combobox.Viewport>
			</ScrollArea.Root>
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>
