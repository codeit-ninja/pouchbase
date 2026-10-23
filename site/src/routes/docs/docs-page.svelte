<script module lang="ts">
	export interface Section {
		id: string;
		title: string;
	}
</script>

<script lang="ts">
	import * as Prose from '#lib/components/ui/prose/index.js';
	import * as SideNav from '#lib/components/ui/side-nav/index.js';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description: string;
		/** The `h2` sections of the page, for the "On this page" outline. */
		sections?: Section[];
		children: Snippet;
	}

	let { title, description, sections = [], children }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Pouchbase docs</title>
	<meta name="description" content={description} />
</svelte:head>

<div class="flex gap-12">
	<article class="min-w-0 flex-1">
		<header class="mb-10 flex flex-col gap-3 border-b border-zinc-200 pb-8">
			<h1
				class="font-display text-3xl leading-tight font-semibold tracking-tight text-zinc-950 sm:text-4xl"
			>
				{title}
			</h1>
			<p class="text-lg text-zinc-600">{description}</p>
		</header>

		<Prose.Root>
			{@render children()}
		</Prose.Root>
	</article>

	{#if sections.length > 0}
		<aside class="hidden w-48 shrink-0 xl:block">
			<SideNav.Root aria-label="On this page" class="sticky top-24">
				<SideNav.Group>
					<SideNav.Title>On this page</SideNav.Title>

					{#each sections as section (section.id)}
						<SideNav.Link href="#{section.id}" class="py-1 text-[13px]">
							{section.title}
						</SideNav.Link>
					{/each}
				</SideNav.Group>
			</SideNav.Root>
		</aside>
	{/if}
</div>
