<script lang="ts">
	import { Tooltip } from 'bits-ui';

	let { ref = $bindable(null), ...rest }: Tooltip.TriggerProps = $props();
</script>

<Tooltip.Trigger bind:ref {...rest} />
