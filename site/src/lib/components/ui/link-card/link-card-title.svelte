<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h3
	{...rest}
	class={[
		'flex items-center gap-1.5 font-semibold text-zinc-950 [&_svg]:size-4 [&_svg]:text-zinc-400 [&_svg]:transition-transform group-hover:[&_svg]:translate-x-0.5',
		className
	]}
>
	{@render children?.()}
</h3>
