<script lang="ts">
	import * as Input from '../inputs/input/index.js';
	import InspectorField from './inspector-field.svelte';

	type Props = {
		label: string;
		id: string;
		value: string;
		placeholder?: string;
		description?: string;
		onValueChange: (value: string) => void;
	};

	let { label, id, value, placeholder, description, onValueChange }: Props = $props();
</script>

<InspectorField {label} for={id} {description}>
	<Input.Root
		{id}
		{value}
		{placeholder}
		autocomplete="off"
		spellcheck="false"
		oninput={(event) => onValueChange(event.currentTarget.value)}
	/>
</InspectorField>
