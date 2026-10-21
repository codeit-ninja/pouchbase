<script lang="ts">
	import { untrack } from 'svelte';
	import * as RichText from '../inputs/rich-text/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<RichText.RootProps, 'value' | 'id'> & {
		/** Initial content, in the given `format`. */
		defaultValue?: string;
	};

	let { defaultValue = '', ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);

	let value = $state(untrack(() => defaultValue));
</script>

<!-- The editor isn't a form control, so its content is submitted through a hidden input. -->
<input {...ctx.field.as('hidden', value)} />

<RichText.Root
	bind:value
	id={ctx.id}
	aria-labelledby="{ctx.id}-label"
	aria-invalid={invalid}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	{...rest}
/>
