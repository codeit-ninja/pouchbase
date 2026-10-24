<script lang="ts">
	import * as Icon from '#lib/components/ui/icon/index.js';

	type Props = {
		/** The provider's logo, e.g. a sign-in plugin's `ui/*.svg`; `null` shows `fallback`. */
		src: string | null | undefined;
		/** Iconify name shown without a logo. Pass a literal, so the icon bundler finds it. */
		fallback: string;
		class?: string;
	};

	let { src, fallback, class: className }: Props = $props();

	/** The logo that didn't load, so a new `src` is tried again. */
	let failed = $state<string | null>(null);
</script>

<!-- A sign-in provider's logo, sized like an icon (1em unless `class` says otherwise). Decorative. -->
{#if src && src !== failed}
	<img
		{src}
		alt=""
		aria-hidden="true"
		loading="lazy"
		decoding="async"
		class={['size-[1em] shrink-0 object-contain', className]}
		onerror={() => (failed = src ?? null)}
	/>
{:else}
	<Icon.Root icon={fallback} class={className} />
{/if}
