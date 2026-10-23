<script lang="ts">
	import { NavigationMenu } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: NavigationMenu.ListProps = $props();
</script>

<NavigationMenu.List bind:ref {...rest} class={['flex items-center gap-1', className]} />
