<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAnchorAttributes = $props();
</script>

<a
	{...rest}
	class={[
		'truncate rounded-sm text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400',
		className
	]}
>
	{@render children?.()}
</a>
