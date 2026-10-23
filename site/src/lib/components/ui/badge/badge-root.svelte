<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	export type Variant = 'neutral' | 'outline';

	export type Props = HTMLAttributes<HTMLSpanElement> & {
		variant?: Variant;
	};
</script>

<script lang="ts">
	let { variant = 'neutral', children, class: className, ...rest }: Props = $props();

	const variants = {
		neutral: 'border-transparent bg-zinc-100 text-zinc-700',
		outline: 'border-zinc-300 text-zinc-600'
	};
</script>

<span
	{...rest}
	class={[
		'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5',
		variants[variant],
		className
	]}
>
	{@render children?.()}
</span>
