<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLButtonAttributes = $props();
</script>

<button
	type="button"
	{...rest}
	class={[
		'flex w-full cursor-pointer flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20',
		className
	]}
>
	{@render children?.()}
</button>
