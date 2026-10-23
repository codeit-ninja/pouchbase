<script lang="ts">
	import * as Logo from '#lib/components/ui/logo/index.js';
	import { resolve } from '$app/paths';
	import { GITHUB_URL } from './site-nav';

	const year = new Date().getFullYear();

	const links = [
		{ label: 'GitHub', href: GITHUB_URL },
		{ label: 'Documentation', href: `${GITHUB_URL}#readme` },
		{ label: 'Issues', href: `${GITHUB_URL}/issues` },
		{ label: 'License', href: `${GITHUB_URL}/blob/main/LICENSE` }
	];
</script>

<footer class="border-t border-zinc-200 bg-zinc-50">
	<div
		class="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between"
	>
		<div class="flex flex-col gap-3">
			<a
				href={resolve('/')}
				class="flex items-center gap-2.5 font-display text-lg font-semibold text-zinc-950"
			>
				<Logo.Root class="size-7" alt="" />
				Pouchbase
			</a>
			<p class="max-w-xs text-sm text-zinc-500">
				An open-source backend for Cloudflare Workers, D1 and R2. Inspired by PocketBase.
			</p>
		</div>

		<nav aria-label="Footer" class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
			{#each links as link (link.href)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external links only -->
				<a href={link.href} class="text-zinc-600 hover:text-zinc-950">{link.label}</a>
			{/each}
		</nav>
	</div>

	<div class="border-t border-zinc-200">
		<p class="mx-auto max-w-6xl px-6 py-5 text-xs text-zinc-500">
			© {year} Pouchbase. Not affiliated with Cloudflare or PocketBase.
		</p>
	</div>
</footer>
