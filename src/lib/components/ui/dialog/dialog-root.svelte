<script lang="ts">
	import { Dialog } from 'bits-ui';

	let { open = $bindable(false), ...rest }: Dialog.RootProps = $props();
</script>

<Dialog.Root bind:open {...rest} />
