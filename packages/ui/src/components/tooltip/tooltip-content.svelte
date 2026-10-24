<script module lang="ts">
	import type { Tooltip } from 'bits-ui';

	/** `text` for a short label, `media` for an image or other content that brings its own size. */
	export type Variant = 'text' | 'media';

	export type Props = Tooltip.ContentProps & { variant?: Variant };
</script>

<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		sideOffset = 4,
		variant = 'text',
		class: className,
		...rest
	}: Props = $props();

	const variants = {
		text: 'bg-zinc-900 px-2 py-1 text-xs text-white',
		media: 'border border-zinc-200 bg-white p-1'
	};
</script>

<TooltipPrimitive.Portal>
	<TooltipPrimitive.Content
		bind:ref
		{sideOffset}
		{...rest}
		class={['z-50 rounded-lg shadow-lg', variants[variant], className]}
	/>
</TooltipPrimitive.Portal>
