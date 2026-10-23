<script lang="ts">
	import { Separator } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: Separator.RootProps = $props();
</script>

<Separator.Root
	bind:ref
	orientation="vertical"
	decorative
	{...rest}
	class={['mx-1 h-5 w-px shrink-0 bg-zinc-200', className]}
/>
