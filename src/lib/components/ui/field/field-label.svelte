<script lang="ts">
	import { Label } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: Label.RootProps = $props();
</script>

<Label.Root bind:ref {...rest} class={['text-sm font-medium text-zinc-900', className]} />
