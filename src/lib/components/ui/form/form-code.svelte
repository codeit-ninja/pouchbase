<script lang="ts">
	import { untrack } from 'svelte';
	import * as Code from '../inputs/code/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<Code.RootProps, 'value' | 'id'> & {
		/** Initial code. */
		defaultValue?: string;
	};

	let { defaultValue = '', ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);

	let value = $state(untrack(() => defaultValue));
</script>

<!--
	The editor isn't a form control, so its content is submitted through a hidden input. That input
	fires no input events, so the field's `value()` is updated explicitly.
-->
<input {...ctx.field.as('hidden', value)} />

<Code.Root
	bind:value
	onValueChange={(next) => ctx.field.set(next)}
	id={ctx.id}
	aria-labelledby="{ctx.id}-label"
	aria-invalid={invalid}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	{...rest}
/>
