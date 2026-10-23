<script lang="ts">
	import { Dialog } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: Dialog.TitleProps = $props();
</script>

<Dialog.Title bind:ref {...rest} class={['text-lg font-semibold text-zinc-900', className]} />
