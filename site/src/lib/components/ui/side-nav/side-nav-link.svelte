<script module lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	export type Props = HTMLAnchorAttributes & {
		/** Marks the link as the current page with `aria-current`. */
		active?: boolean;
	};
</script>

<script lang="ts">
	let { active = false, href, children, class: className, ...rest }: Props = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass hrefs built with resolve() -->
<a
	{...rest}
	{href}
	aria-current={active ? 'page' : undefined}
	class={[
		'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 aria-[current=page]:bg-brand-50 aria-[current=page]:font-medium aria-[current=page]:text-brand-700 [&_svg]:size-4 [&_svg]:shrink-0',
		className
	]}
>
	{@render children?.()}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
