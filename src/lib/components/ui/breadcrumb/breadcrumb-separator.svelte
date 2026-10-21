<script lang="ts">
	import * as Icon from '../icon';
	import type { HTMLLiAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLLiAttributes = $props();
</script>

<li
	{...rest}
	role="presentation"
	aria-hidden="true"
	class={['inline-flex text-zinc-400 [&_svg]:size-4', className]}
>
	{#if children}
		{@render children()}
	{:else}
		<Icon.Root icon="lucide:chevron-right" />
	{/if}
</li>
