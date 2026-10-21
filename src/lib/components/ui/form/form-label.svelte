<script lang="ts">
	import { Label } from 'bits-ui';
	import { getFieldContext } from './form-context';

	let { ref = $bindable(null), class: className, ...rest }: Label.RootProps = $props();

	const { id } = getFieldContext();
</script>

<Label.Root
	bind:ref
	id="{id}-label"
	for={id}
	{...rest}
	class={['text-sm font-medium text-zinc-900', className]}
/>
