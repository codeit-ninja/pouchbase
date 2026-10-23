<script lang="ts">
	import * as Slider from '../inputs/slider/index.js';
	import InspectorField from './inspector-field.svelte';

	type Props = {
		label: string;
		id: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		/** Unit shown after the value. */
		unit?: string;
		onValueChange: (value: number) => void;
	};

	let { label, id, value, min, max, step = 1, unit = 'px', onValueChange }: Props = $props();
</script>

<InspectorField {label} value="{value}{unit}">
	<Slider.Root
		{id}
		{value}
		{min}
		{max}
		{step}
		aria-label={label}
		onValueChange={(next) => onValueChange(next)}
	/>
</InspectorField>
