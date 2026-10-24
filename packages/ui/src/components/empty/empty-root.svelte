<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	{...rest}
	class={[
		'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center',
		className
	]}
>
	{@render children?.()}
</div>
