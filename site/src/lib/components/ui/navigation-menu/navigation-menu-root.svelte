<script lang="ts">
	import { NavigationMenu } from 'bits-ui';

	let {
		value = $bindable(''),
		ref = $bindable(null),
		class: className,
		...rest
	}: NavigationMenu.RootProps = $props();
</script>

<NavigationMenu.Root bind:value bind:ref {...rest} class={['relative', className]} />
