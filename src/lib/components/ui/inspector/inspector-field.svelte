<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Field from '../field/index.js';

	type Props = {
		label: string;
		/** `id` of the control, so the label is linked to it. */
		for?: string;
		/** Shown at the end of the label row, e.g. the current value. */
		value?: string;
		description?: string;
		class?: string;
		children?: Snippet;
	};

	let { label, for: id, value, description, class: className, children }: Props = $props();
</script>

<Field.Root class={className}>
	<div class="flex items-center justify-between gap-2">
		<Field.Label
			for={id}
			id={id ? `${id}-label` : undefined}
			class="text-xs font-medium text-zinc-600"
		>
			{label}
		</Field.Label>
		{#if value}
			<span class="text-xs text-zinc-500 tabular-nums">{value}</span>
		{/if}
	</div>
	{@render children?.()}
	{#if description}
		<Field.Description class="text-xs">{description}</Field.Description>
	{/if}
</Field.Root>
