<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { setFieldContext, type AnyRemoteFormField } from './form-context';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Field of a remote form, e.g. `myForm.fields.username`. */
		field: AnyRemoteFormField;
		/** `horizontal` puts the control next to its label, e.g. for checkboxes. */
		orientation?: 'vertical' | 'horizontal';
	};

	let { field, orientation = 'vertical', children, class: className, ...rest }: Props = $props();

	const id = $props.id();

	setFieldContext({
		get field() {
			return field;
		},
		id
	});
</script>

<div
	{...rest}
	class={[
		orientation === 'vertical'
			? 'flex flex-col gap-1.5'
			: 'flex flex-wrap items-center gap-x-2 gap-y-1',
		className
	]}
>
	{@render children?.()}
</div>
