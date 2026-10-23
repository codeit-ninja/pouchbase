<script lang="ts">
	import * as Checkbox from '../inputs/checkbox/index.js';
	import * as Field from '../field/index.js';

	type Props = {
		label: string;
		id: string;
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
	};

	let { label, id, checked, onCheckedChange }: Props = $props();
</script>

<div class="flex items-center gap-2">
	<Checkbox.Root
		{id}
		{checked}
		onchange={(event) => onCheckedChange(event.currentTarget.checked)}
	/>
	<Field.Label for={id} class="text-sm font-normal text-zinc-700">{label}</Field.Label>
</div>
