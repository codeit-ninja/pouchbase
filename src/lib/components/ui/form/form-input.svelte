<script lang="ts">
	import * as Input from '../inputs/input/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<Input.RootProps, 'type' | 'name' | 'value' | 'id'> & {
		type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number' | 'datetime-local';
		/** Initial value, also restored when the form is reset. */
		defaultValue?: string;
	};

	let { type = 'text', defaultValue, ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);
</script>

<Input.Root
	{...ctx.field.as(type, defaultValue)}
	id={ctx.id}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	{...rest}
/>
