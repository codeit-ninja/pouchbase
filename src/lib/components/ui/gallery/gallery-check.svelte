<script lang="ts">
	import * as Checkbox from '../inputs/checkbox';

	type Props = Omit<Checkbox.RootProps, 'class'>;

	let { checked, ...rest }: Props = $props();
</script>

<!-- Top-left over the preview; visible on hover, focus or when checked. -->
<span
	class={[
		'absolute top-4 left-4 flex size-6 items-center justify-center rounded-md bg-white/90 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100',
		checked ? 'opacity-100' : 'opacity-0'
	]}
>
	<Checkbox.Root {checked} {...rest} />
</span>
