<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import CloudflareSectionSkeleton from './cloudflare-section-skeleton.svelte';

	type Props = {
		/** Id of the heading, for `aria-labelledby`. */
		id: string;
		title: string;
		description?: string;
		/** Shape of the skeleton while the section loads. */
		skeleton: 'tiles' | 'table' | 'charts' | 'meters';
		/** Controls next to the heading, e.g. a range switch; rendered outside the boundary. */
		actions?: Snippet;
		children: Snippet;
	};

	let { id, title, description, skeleton, actions, children }: Props = $props();
</script>

<!--
	One section of the Cloudflare overview. Each has its own boundary: the heading renders right
	away with a skeleton below it, and a failure (or slow Cloudflare API) only affects this section.
-->
<section class="flex flex-col gap-4" aria-labelledby={id}>
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h2 {id} class="text-sm font-semibold text-zinc-900">{title}</h2>
			{#if description}
				<p class="text-sm text-zinc-500">{description}</p>
			{/if}
		</div>

		{@render actions?.()}
	</div>

	<svelte:boundary>
		{#snippet pending()}
			<CloudflareSectionSkeleton variant={skeleton} />
		{/snippet}

		{#snippet failed(error, reset)}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-x" /></Callout.Icon>
				<Callout.Body>
					<Callout.Title>This section could not be loaded</Callout.Title>
					<Callout.Description>
						{error instanceof Error ? error.message : String(error)}
					</Callout.Description>
					<div class="pt-1">
						<Button.Root variant="secondary" onclick={reset}>
							<Icon.Root icon="lucide:refresh-cw" />
							Retry
						</Button.Root>
					</div>
				</Callout.Body>
			</Callout.Root>
		{/snippet}

		{@render children()}
	</svelte:boundary>
</section>
