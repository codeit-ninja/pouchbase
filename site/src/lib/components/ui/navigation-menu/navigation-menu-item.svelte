<script lang="ts">
	import { NavigationMenu } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: NavigationMenu.ItemProps = $props();
</script>

<!-- `relative`, so the dropdown content can hang below its own trigger. -->
<NavigationMenu.Item bind:ref {...rest} class={['relative', className]} />
