<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	{...rest}
	aria-hidden="true"
	class={[
		'flex size-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 [&_svg]:size-5',
		className
	]}
>
	{@render children?.()}
</div>
