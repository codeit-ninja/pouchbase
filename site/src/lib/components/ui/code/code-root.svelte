<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<!-- Inline code, e.g. a variable or file name in running text. -->
<code
	{...rest}
	class={[
		'not-prose rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] font-medium break-words text-zinc-800',
		className
	]}
>
	{@render children?.()}
</code>
