<script module lang="ts">
	import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

	export type Variant = 'neutral' | 'outline' | 'success' | 'warning' | 'danger';

	export type Props = HTMLAttributes<HTMLElement> &
		Pick<HTMLAnchorAttributes, 'href' | 'target' | 'rel'> & {
			variant?: Variant;
		};
</script>

<script lang="ts">
	let { variant = 'neutral', href, children, class: className, ...rest }: Props = $props();

	const variants = {
		neutral: 'border-transparent bg-zinc-100 text-zinc-700',
		outline: 'border-zinc-300 text-zinc-600',
		success: 'border-transparent bg-emerald-50 text-emerald-700',
		warning: 'border-transparent bg-amber-50 text-amber-800',
		danger: 'border-transparent bg-red-50 text-red-700'
	};

	const links = {
		neutral: 'hover:bg-zinc-200 hover:text-zinc-900',
		outline: 'hover:border-zinc-400 hover:text-zinc-900',
		success: 'hover:bg-emerald-100',
		warning: 'hover:bg-amber-100',
		danger: 'hover:bg-red-100'
	};
</script>

<!-- With `href` the badge is a link, e.g. to a related record. -->
<svelte:element
	this={href === undefined ? 'span' : 'a'}
	{...rest}
	{href}
	class={[
		'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5',
		variants[variant],
		href !== undefined &&
			`transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none ${links[variant]}`,
		className
	]}
>
	{@render children?.()}
</svelte:element>
