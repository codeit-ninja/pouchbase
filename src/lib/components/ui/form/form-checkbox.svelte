<script lang="ts">
	import * as Checkbox from '../inputs/checkbox/index.js';
	import { getFieldContext } from './form-context';

	type Props = Omit<Checkbox.RootProps, 'name' | 'value' | 'id' | 'checked'> & {
		/** Initially checked. */
		defaultChecked?: boolean;
	};

	let { defaultChecked = false, ...rest }: Props = $props();

	const ctx = getFieldContext();
	const invalid = $derived(!!ctx.field.issues()?.length);
</script>

<!-- Use inside `<Form.Field orientation="horizontal">`, before `Form.Label`. -->
<Checkbox.Root
	{...ctx.field.as('checkbox', defaultChecked)}
	id={ctx.id}
	aria-describedby={invalid ? `${ctx.id}-errors` : undefined}
	{...rest}
/>
