<script module lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	export type Variant = 'default' | 'ghost';

	export type Props = HTMLInputAttributes & {
		ref?: HTMLInputElement | null;
		/** `ghost` looks like plain text until hovered or focused, for editing in place (e.g. in a list). */
		variant?: Variant;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		value = $bindable(),
		type = 'text',
		variant = 'default',
		class: className,
		...rest
	}: Props = $props();

	const variants = {
		default: 'border-zinc-300 bg-white shadow-xs',
		ghost:
			'border-transparent bg-transparent hover:border-zinc-200 focus-visible:bg-white read-only:hover:border-transparent read-only:focus-visible:border-transparent read-only:focus-visible:ring-0'
	};
</script>

<input
	bind:this={ref}
	bind:value
	{type}
	{...rest}
	class={[
		'h-control rounded-md border px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/10',
		variants[variant],
		className
	]}
/>
