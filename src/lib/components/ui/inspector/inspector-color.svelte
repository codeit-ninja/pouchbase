<script lang="ts">
	import * as Button from '../button/index.js';
	import * as Color from '../inputs/color/index.js';
	import * as Icon from '../icon/index.js';
	import InspectorField from './inspector-field.svelte';

	type Props = {
		label: string;
		id: string;
		/** `null` when the color is inherited. */
		value: string | null;
		/** The color that applies while `value` is `null`. */
		inherited?: string;
		/** Text of the reset button's tooltip, e.g. "Use the email's button color". */
		resetLabel?: string;
		onValueChange: (value: string | null) => void;
	};

	let { label, id, value, inherited, resetLabel = 'Reset', onValueChange }: Props = $props();
</script>

<InspectorField {label} for={id}>
	<div class="flex gap-1">
		<Color.Root
			{id}
			value={value ?? inherited ?? '#000000'}
			class={['min-w-0 flex-1', value === null && inherited !== undefined && 'text-zinc-400']}
			onValueChange={(color) => onValueChange(color)}
		/>
		{#if value !== null && inherited !== undefined}
			<Button.Root
				type="button"
				variant="ghost"
				size="icon"
				aria-label={resetLabel}
				title={resetLabel}
				onclick={() => onValueChange(null)}
			>
				<Icon.Root icon="lucide:rotate-ccw" />
			</Button.Root>
		{/if}
	</div>
</InspectorField>
