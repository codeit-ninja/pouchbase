<script lang="ts">
	import { Dialog } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: Dialog.DescriptionProps = $props();
</script>

<Dialog.Description bind:ref {...rest} class={['text-sm text-zinc-500', className]} />
