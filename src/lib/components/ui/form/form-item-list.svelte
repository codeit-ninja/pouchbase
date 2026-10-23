<script lang="ts">
	import { untrack } from 'svelte';
	import * as ItemList from '../inputs/item-list/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<ItemList.RootProps, 'value' | 'id'> & {
		/** Initial items. */
		defaultValue?: string[];
	};

	let { defaultValue = [], onValueChange, ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);

	let value = $state(untrack(() => [...defaultValue]));
</script>

<!-- The items are submitted as a JSON array through a hidden input. -->
<input {...ctx.field.as('hidden', JSON.stringify(value))} />

<ItemList.Root
	bind:value
	id={ctx.id}
	aria-invalid={invalid}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	onValueChange={(next) => {
		ctx.field.set(JSON.stringify(next));
		onValueChange?.(next);
	}}
	{...rest}
/>
