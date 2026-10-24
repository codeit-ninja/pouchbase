<script lang="ts">
	import { Tooltip } from 'bits-ui';

	let { open = $bindable(false), delayDuration = 300, ...rest }: Tooltip.RootProps = $props();
</script>

<!-- Each tooltip brings its own provider, so it works anywhere without app-level setup. -->
<Tooltip.Provider>
	<Tooltip.Root bind:open {delayDuration} {...rest} />
</Tooltip.Provider>
