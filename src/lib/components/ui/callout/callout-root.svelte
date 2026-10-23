<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	export type Variant = 'info' | 'success' | 'warning' | 'error';

	export type Props = HTMLAttributes<HTMLDivElement> & {
		variant?: Variant;
	};
</script>

<script lang="ts">
	let { variant = 'info', children, class: className, ...rest }: Props = $props();

	const variants: Record<Variant, string> = {
		info: 'border-zinc-200 bg-zinc-50 text-zinc-700 [&_svg]:text-zinc-500',
		success: 'border-emerald-200 bg-emerald-50 text-emerald-900 [&_svg]:text-emerald-600',
		warning: 'border-amber-200 bg-amber-50 text-amber-900 [&_svg]:text-amber-600',
		error: 'border-red-200 bg-red-50 text-red-800 [&_svg]:text-red-600'
	};
</script>

<!-- A short message that needs attention next to the content: a hint, a result, a warning or an error. -->
<div
	role={variant === 'error' ? 'alert' : 'status'}
	{...rest}
	class={['flex gap-3 rounded-lg border p-4 text-sm', variants[variant], className]}
>
	{@render children?.()}
</div>
