<script lang="ts">
	import { Collapsible } from 'bits-ui';

	let { ref = $bindable(null), children, ...rest }: Collapsible.ContentProps = $props();
</script>

<Collapsible.Content bind:ref {...rest}>
	{@render children?.()}
</Collapsible.Content>
