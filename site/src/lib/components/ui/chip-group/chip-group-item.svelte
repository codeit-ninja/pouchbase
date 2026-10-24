<script module lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	export type Props = HTMLAnchorAttributes & {
		/** The filter that is applied now. */
		active?: boolean;
	};
</script>

<script lang="ts">
	let { href, active = false, children, class: className, ...rest }: Props = $props();
</script>

<li>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass hrefs built with resolve() -->
	<a
		{...rest}
		{href}
		aria-current={active ? 'true' : undefined}
		class={[
			'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 [&_svg]:size-4',
			active
				? 'border-zinc-900 bg-zinc-900 text-white'
				: 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900',
			className
		]}
	>
		{@render children?.()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</li>
