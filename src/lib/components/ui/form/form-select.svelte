<script lang="ts">
	import { untrack } from 'svelte';
	import * as Select from '../inputs/select/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<Select.RootProps, 'name' | 'value' | 'id'> & {
		/** Initially selected value. */
		defaultValue?: string;
	};

	let { defaultValue = '', onValueChange, ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);
	const attributes = $derived(ctx.field.as('select'));

	let value = $state(untrack(() => defaultValue));
</script>

<!--
	The custom select submits through a hidden input, which doesn't fire input events, so the
	field's `value()` is updated explicitly.
-->
<Select.Root
	bind:value
	name={attributes.name}
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
