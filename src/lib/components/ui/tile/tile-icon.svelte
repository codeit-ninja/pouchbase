<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	{...rest}
	aria-hidden="true"
	class={[
		'flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 [&_svg]:size-5',
		className
	]}
>
	{@render children?.()}
</div>
