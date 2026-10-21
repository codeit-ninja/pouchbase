<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	type Props = HTMLAnchorAttributes & {
		/** Marks the link as the current page. */
		active?: boolean;
	};

	let { active = false, children, class: className, ...rest }: Props = $props();
</script>

<a
	{...rest}
	aria-current={active ? 'page' : undefined}
	class={[
		'flex h-control items-center gap-2 rounded-md border border-transparent px-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-zinc-500',
		active && 'bg-zinc-200/80 font-medium text-zinc-900',
		className
	]}
>
	{@render children?.()}
</a>
