<script lang="ts">
	import { untrack } from 'svelte';
	import * as MultiSelect from '../inputs/multi-select/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<MultiSelect.RootProps, 'value' | 'id'> & {
		/** Initially selected values. */
		defaultValue?: string[];
	};

	let { defaultValue = [], onValueChange, ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);

	let value = $state(untrack(() => [...defaultValue]));
</script>

<!-- The selection is submitted as a JSON array through a hidden input. -->
<input {...ctx.field.as('hidden', JSON.stringify(value))} />

<MultiSelect.Root
	bind:value
	id={ctx.id}
	aria-labelledby="{ctx.id}-label"
	aria-invalid={invalid}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	onValueChange={(next) => {
		ctx.field.set(JSON.stringify(next));
		onValueChange?.(next);
	}}
	{...rest}
/>
