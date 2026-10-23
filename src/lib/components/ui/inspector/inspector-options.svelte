<script lang="ts" generics="T extends string">
	import * as Icon from '../icon/index.js';
	import * as Segmented from '../segmented/index.js';
	import InspectorField from './inspector-field.svelte';

	type Props = {
		label: string;
		value: T;
		/** With `icon`, the option shows only its icon and uses `label` for assistive technology. */
		options: { value: T; label: string; icon?: string }[];
		onValueChange: (value: T) => void;
	};

	let { label, value, options, onValueChange }: Props = $props();
</script>

<InspectorField {label}>
	<Segmented.Root {value} aria-label={label} onValueChange={(next) => onValueChange(next as T)}>
		{#each options as option (option.value)}
			{#if option.icon}
				<Segmented.Item value={option.value} aria-label={option.label}>
					<Icon.Root icon={option.icon} />
				</Segmented.Item>
			{:else}
				<Segmented.Item value={option.value}>{option.label}</Segmented.Item>
			{/if}
		{/each}
	</Segmented.Root>
</InspectorField>
