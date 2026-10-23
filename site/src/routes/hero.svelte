<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import HeroScene from './hero-scene.svelte';
	import { resolve } from '$app/paths';
	import { GITHUB_URL } from './site-nav';
</script>

<section class="relative overflow-hidden">
	<div
		class="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-24 lg:pb-28"
	>
		<div class="flex max-w-xl flex-col gap-7">
			<h1
				class="font-display text-5xl leading-[0.98] font-semibold tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl"
			>
				The open-source backend for Cloudflare Workers.
			</h1>

			<p class="text-lg leading-relaxed text-zinc-600 sm:text-xl">
				Collections, users, OAuth sign-in and file storage, running on Workers, D1 and R2, deployed
				to your own Cloudflare account.
			</p>

			<div class="flex flex-wrap items-center gap-3">
				<Button.Root variant="brand" href="{resolve('/')}#self-hosting" class="h-12 px-6 text-base">
					Deploy your own
					<Icon.Root icon="lucide:arrow-right" />
				</Button.Root>

				<Button.Root variant="secondary" href={GITHUB_URL} class="h-12 px-6 text-base">
					<Icon.Root icon="simple-icons:github" />
					View on GitHub
				</Button.Root>
			</div>

			<p class="flex items-center gap-2 text-sm text-zinc-500">
				<Icon.Root icon="lucide:construction" class="size-4 text-brand-500" />
				Under active development. Not yet ready for production use.
			</p>
		</div>

		<HeroScene />
	</div>
</section>
