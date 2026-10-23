<script lang="ts">
	import { untrack } from 'svelte';
	import * as DatePicker from '../inputs/date-picker/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<DatePicker.RootProps, 'name' | 'value' | 'id'> & {
		/** Initial date, as ISO 8601 text. */
		defaultValue?: string;
	};

	let { defaultValue = '', onValueChange, ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);

	let value = $state(untrack(() => defaultValue));
</script>

<!--
	The date picker isn't a single form control, so its value is submitted through a hidden input.
	That input fires no input events, so the field's `value()` is updated explicitly.
-->
<input {...ctx.field.as('hidden', value)} />

<DatePicker.Root
	bind:value
	id={ctx.id}
	aria-labelledby="{ctx.id}-label"
	aria-invalid={invalid}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	onValueChange={(next) => {
		ctx.field.set(next);
		onValueChange?.(next);
	}}
	{...rest}
/>
