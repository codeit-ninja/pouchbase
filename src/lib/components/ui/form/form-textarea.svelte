<script lang="ts">
	import * as Textarea from '../inputs/textarea/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<Textarea.RootProps, 'name' | 'value' | 'id'> & {
		/** Initial value, also restored when the form is reset. */
		defaultValue?: string;
	};

	let { defaultValue, ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);
</script>

<Textarea.Root
	{...ctx.field.as('text', defaultValue)}
	id={ctx.id}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	{...rest}
/>
