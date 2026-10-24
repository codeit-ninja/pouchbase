<script lang="ts">
	import type { HTMLLiAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLLiAttributes = $props();
</script>

<li
	{...rest}
	class={[
		'flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs',
		className
	]}
>
	{@render children?.()}
</li>
