<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';

	const providers = ['Google', 'GitHub', 'Microsoft', 'Discord', 'Twitch'];
</script>

<section class="border-t border-zinc-200 bg-zinc-50">
	<div class="mx-auto flex max-w-6xl flex-col gap-14 px-6 py-20 lg:py-28">
		<div class="flex max-w-2xl flex-col gap-4">
			<h2
				class="font-display text-3xl leading-tight font-semibold tracking-tight text-zinc-950 sm:text-4xl"
			>
				Everything your app needs, on your own Cloudflare account.
			</h2>
			<p class="text-lg text-zinc-600">
				Pouchbase runs entirely on Cloudflare Workers, with D1 as the database and R2 for files.
				There is nothing else to host.
			</p>
		</div>

		<div class="grid gap-x-12 gap-y-12 md:grid-cols-2">
			<article id="collections" class="flex scroll-mt-24 flex-col gap-3">
				<span
					class="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600"
				>
					<Icon.Root icon="lucide:database" class="size-5" />
				</span>
				<h3 class="font-display text-xl font-semibold text-zinc-950">Collections and fields</h3>
				<p class="text-zinc-600">
					Model your data in the admin interface: collections, fields and indexes, stored in D1. A
					records API is on its way.
				</p>
			</article>

			<article id="authentication" class="flex scroll-mt-24 flex-col gap-3">
				<span
					class="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600"
				>
					<Icon.Root icon="lucide:key-round" class="size-5" />
				</span>
				<h3 class="font-display text-xl font-semibold text-zinc-950">Users and sign-in</h3>
				<p class="text-zinc-600">
					A built-in users collection with username and password sign-in, optional self sign-up, and
					OAuth with the providers your users already have.
				</p>
				<ul class="flex flex-wrap gap-1.5" aria-label="OAuth providers">
					{#each providers as provider (provider)}
						<li><Badge.Root variant="outline">{provider}</Badge.Root></li>
					{/each}
				</ul>
			</article>

			<article id="files" class="flex scroll-mt-24 flex-col gap-3">
				<span
					class="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600"
				>
					<Icon.Root icon="lucide:image" class="size-5" />
				</span>
				<h3 class="font-display text-xl font-semibold text-zinc-950">File storage</h3>
				<p class="text-zinc-600">
					Uploads go in the built-in files collection and are stored in Cloudflare R2. Link them to
					records with a relation field, like a user's avatar.
				</p>
			</article>

			<article class="flex flex-col gap-3">
				<span
					class="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600"
				>
					<Icon.Root icon="lucide:code" class="size-5" />
				</span>
				<h3 class="font-display text-xl font-semibold text-zinc-950">A public API</h3>
				<p class="text-zinc-600">
					Sign users in from any origin and get back a JWT. OAuth uses a PKCE flow, so the token
					never ends up in a URL.
				</p>
			</article>
		</div>
	</div>
</section>
