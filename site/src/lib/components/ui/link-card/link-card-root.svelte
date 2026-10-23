<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	let { href, children, class: className, ...rest }: HTMLAnchorAttributes = $props();
</script>

<!-- A card that is a link as a whole, e.g. to choose between options that each have their own page. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass hrefs built with resolve() -->
<a
	{...rest}
	{href}
	class={[
		'group not-prose flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition outline-none hover:border-brand-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400',
		className
	]}
>
	{@render children?.()}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
