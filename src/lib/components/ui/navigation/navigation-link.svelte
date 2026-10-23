<script module lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	export type Props = HTMLAnchorAttributes & {
		/** Marks the link as the current page. Defaults to whether `href` matches the current path. */
		active?: boolean;
	};
</script>

<script lang="ts">
	import { page } from '$app/state';

	let { active, children, class: className, ...rest }: Props = $props();

	const isActive = $derived(active ?? page.url.pathname === rest.href);
</script>

<a
	{...rest}
	aria-current={isActive ? 'page' : undefined}
	class={[
		'flex h-row items-center gap-2 rounded-md border border-transparent px-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-zinc-500',
		isActive && 'bg-zinc-200/80 font-medium text-zinc-900',
		className
	]}
>
	{@render children?.()}
</a>
