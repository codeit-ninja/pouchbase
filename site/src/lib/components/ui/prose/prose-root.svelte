<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Long-form text such as the docs. Components with their own styling opt out with `not-prose`. -->
<div
	{...rest}
	class={[
		'prose max-w-none prose-zinc prose-headings:font-display prose-headings:tracking-tight prose-h2:scroll-mt-20 prose-h3:scroll-mt-20 prose-a:font-medium prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline',
		className
	]}
>
	{@render children?.()}
</div>
