<script module lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	export type Props = HTMLAnchorAttributes & {
		href: string;
	};
</script>

<script lang="ts">
	let { children, class: className, ...rest }: Props = $props();
</script>

<!-- An inline text link, e.g. a file name in the data grid that opens its record. -->
<a
	{...rest}
	class={[
		'rounded-sm underline-offset-2 hover:text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400',
		className
	]}
>
	{@render children?.()}
</a>
