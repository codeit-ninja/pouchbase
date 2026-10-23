<script lang="ts">
	import { NavigationMenu } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: NavigationMenu.ContentProps = $props();
</script>

<NavigationMenu.Content
	bind:ref
	{...rest}
	class={[
		'absolute top-full left-0 z-50 mt-2 flex min-w-72 flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg outline-none',
		className
	]}
/>
