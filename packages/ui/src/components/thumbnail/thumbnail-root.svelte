<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type Size = 'sm' | 'md' | 'lg' | 'fill';

	export type Props = {
		/** Image URL; without one (or when it fails to load) `children` is shown instead. */
		src?: string | null;
		/** Larger image URL shown in a tooltip on hover, once `src` has loaded. */
		preview?: string | null;
		alt?: string;
		size?: Size;
		class?: string;
		/** Fallback, usually an icon. */
		children?: Snippet;
	};
</script>

<script lang="ts">
	import * as Tooltip from '../tooltip/index.js';

	let { src, preview, alt = '', size = 'md', class: className, children }: Props = $props();

	// Remembers which URL failed, so a new `src` gets a fresh attempt.
	let failedSrc = $state<string | null>(null);
	const failed = $derived(!!src && failedSrc === src);

	const sizes = {
		sm: 'size-6 rounded [&_svg]:size-3.5',
		md: 'size-10 rounded-md [&_svg]:size-5',
		lg: 'size-40 rounded-lg [&_svg]:size-10',
		/** Fills the width as a square, e.g. in a gallery. */
		fill: 'aspect-square w-full rounded-lg [&_svg]:size-10'
	};
</script>

{#snippet box(props: Record<string, unknown> = {})}
	<span
		{...props}
		class={[
			'inline-flex shrink-0 items-center justify-center overflow-hidden border border-zinc-200 bg-zinc-50 text-zinc-400',
			sizes[size],
			className
		]}
	>
		{#if src && !failed}
			<img
				{src}
				{alt}
				loading="lazy"
				class="size-full object-cover"
				onerror={() => (failedSrc = src ?? null)}
			/>
		{:else}
			{@render children?.()}
		{/if}
	</span>
{/snippet}

{#if preview && src && !failed}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render box(props)}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content variant="media" side="right">
			<img src={preview} {alt} class="block max-h-48 max-w-48 rounded-md object-contain" />
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render box()}
{/if}
