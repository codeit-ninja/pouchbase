<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Skeleton from '#lib/components/ui/skeleton/index.js';
	import * as Tile from '#lib/components/ui/tile/index.js';

	type Props = {
		/** Shape of the content that is loading. */
		variant: 'tiles' | 'table' | 'charts' | 'meters';
	};

	let { variant }: Props = $props();
</script>

<!-- Placeholder for one dashboard section while its Cloudflare data loads. -->
<div aria-busy="true">
	<span class="sr-only" role="status">Loading…</span>

	{#if variant === 'tiles'}
		<Tile.Grid>
			{#each [0, 1, 2] as i (i)}
				<Tile.Root>
					<Tile.Header>
						<Skeleton.Root class="size-10 rounded-lg" />
						<Skeleton.Root class="h-4 w-28" />
					</Tile.Header>
					<Skeleton.Root class="h-7 w-20" />
					<Skeleton.Root class="h-4 w-40" />
				</Tile.Root>
			{/each}
		</Tile.Grid>
	{:else if variant === 'table'}
		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				{#each [0, 1, 2] as i (i)}
					<Skeleton.Root class="h-5 w-full" />
				{/each}
			</Card.Content>
		</Card.Root>
	{:else if variant === 'charts'}
		<div class="grid gap-4 md:grid-cols-2">
			{#each [0, 1, 2, 3] as i (i)}
				<Card.Root>
					<Card.Header>
						<Skeleton.Root class="h-5 w-32" />
						<Skeleton.Root class="h-4 w-48" />
					</Card.Header>
					<Card.Content>
						<Skeleton.Root class="h-40 w-full" />
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="flex flex-col gap-5">
				{#each [0, 1, 2, 3] as i (i)}
					<div class="flex flex-col gap-2">
						<div class="flex justify-between">
							<Skeleton.Root class="h-4 w-32" />
							<Skeleton.Root class="h-4 w-24" />
						</div>
						<Skeleton.Root class="h-1.5 w-full rounded-full" />
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
