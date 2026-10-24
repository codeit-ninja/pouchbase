<script module lang="ts">
	import type { Item } from '../select/index.js';

	export type Props = {
		items: Item[];
		value?: string[];
		placeholder?: string;
		id?: string;
		disabled?: boolean;
		class?: string;
		onValueChange?: (value: string[]) => void;
		'aria-invalid'?: boolean | 'true' | 'false';
		'aria-describedby'?: string;
		'aria-labelledby'?: string;
	};
</script>

<script lang="ts">
	import { Select } from 'bits-ui';
	import * as Icon from '../../icon';
	import * as ScrollArea from '../../scroll-area/index.js';

	let {
		items,
		value = $bindable([]),
		placeholder = 'Select…',
		id,
		disabled = false,
		class: className,
		onValueChange,
		...aria
	}: Props = $props();

	const selected = $derived(items.filter((item) => value.includes(item.value)));
</script>

<Select.Root
	type="multiple"
	bind:value
	{disabled}
	items={items.map(({ value, label, disabled }) => ({ value, label, disabled }))}
	{onValueChange}
>
	<Select.Trigger
		{id}
		{...aria}
		class={[
			'flex min-h-control w-full cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-left text-sm text-zinc-900 shadow-xs outline-none focus-visible:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/10 data-[state=open]:border-zinc-900',
			className
		]}
	>
		<span class="flex min-w-0 flex-1 flex-wrap gap-1">
			{#each selected as item (item.value)}
				<span class="max-w-48 truncate rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium">
					{item.label}
				</span>
			{:else}
				<span class="text-zinc-400">{placeholder}</span>
			{/each}
		</span>

		<Icon.Root icon="lucide:chevrons-up-down" class="size-4 text-zinc-500" />
	</Select.Trigger>

	<Select.Portal>
		<Select.Content
			sideOffset={4}
			class="z-50 max-h-(--bits-select-content-available-height) w-(--bits-select-anchor-width) min-w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg outline-none"
		>
			<!-- At most 18rem high, so long lists scroll instead of filling the screen. -->
			<ScrollArea.Root
				type="auto"
				viewportClass="max-h-[min(18rem,calc(var(--bits-select-content-available-height)-2px))]"
			>
				<Select.Viewport class="p-1.5">
					{#each items as item (item.value)}
						<Select.Item
							value={item.value}
							label={item.label}
							disabled={item.disabled}
							class="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-700 outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-zinc-100 data-highlighted:text-zinc-900"
						>
							{#snippet children({ selected: isSelected })}
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
						</Select.Item>
					{:else}
						<div class="px-3 py-2 text-sm text-zinc-500">No records</div>
					{/each}
				</Select.Viewport>
			</ScrollArea.Root>
		</Select.Content>
	</Select.Portal>
</Select.Root>
