<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Logo from '#lib/components/ui/logo/index.js';
	import * as NavigationMenu from '#lib/components/ui/navigation-menu/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { resolve } from '$app/paths';
	import { GITHUB_URL, isGroup, navigation } from './site-nav';

	let menuOpen = $state(false);
</script>

<header class="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md">
	<div class="mx-auto flex h-header max-w-6xl items-center gap-8 px-6">
		<a
			href={resolve('/')}
			class="flex items-center gap-2.5 rounded-md font-display text-lg font-semibold tracking-tight text-zinc-950 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
		>
			<Logo.Root class="size-7" alt="" />
			Pouchbase
		</a>

		<NavigationMenu.Root class="hidden md:block">
			<NavigationMenu.List>
				{#each navigation as entry (entry.label)}
					<NavigationMenu.Item>
						{#if isGroup(entry)}
							<NavigationMenu.Trigger>{entry.label}</NavigationMenu.Trigger>

							<NavigationMenu.Content>
								{#each entry.links as link (link.href)}
									<NavigationMenu.Link variant="item" href={link.href}>
										{#if link.icon}
											<Icon.Root icon={link.icon} />
										{/if}

										<span class="flex flex-col gap-0.5">
											<span class="font-medium text-zinc-900">{link.label}</span>
											<span class="text-xs text-zinc-500">{link.description}</span>
										</span>
									</NavigationMenu.Link>
								{/each}
							</NavigationMenu.Content>
						{:else}
							<NavigationMenu.Link href={entry.href}>{entry.label}</NavigationMenu.Link>
						{/if}
					</NavigationMenu.Item>
				{/each}
			</NavigationMenu.List>
		</NavigationMenu.Root>

		<div class="ml-auto flex items-center gap-2">
			<!-- Wrapped, because `hidden` on the button itself loses against its own `inline-flex`. -->
			<span class="hidden sm:contents">
				<Button.Root variant="ghost" href={GITHUB_URL}>
					<Icon.Root icon="simple-icons:github" />
					Star on GitHub
				</Button.Root>
			</span>

			<Button.Root variant="brand" href="{resolve('/')}#self-hosting">Get started</Button.Root>

			<Button.Root
				variant="ghost"
				size="icon"
				class="md:hidden"
				aria-label="Open menu"
				onclick={() => (menuOpen = true)}
			>
				<Icon.Root icon="lucide:menu" />
			</Button.Root>
		</div>
	</div>
</header>

<Sheet.Root bind:open={menuOpen}>
	<Sheet.Content class="max-w-sm">
		<Sheet.Header>
			<Sheet.Title>Menu</Sheet.Title>
		</Sheet.Header>

		<Sheet.Body class="gap-6">
			{#each navigation as entry (entry.label)}
				{#if isGroup(entry)}
					<nav aria-label={entry.label} class="flex flex-col gap-1">
						<p class="px-3 pb-1 text-xs font-medium text-zinc-500">{entry.label}</p>

						{#each entry.links as link (link.href)}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- hrefs are built with resolve() in site-nav.ts -->
							<a
								href={link.href}
								onclick={() => (menuOpen = false)}
								class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 [&_svg]:size-4 [&_svg]:text-brand-500"
							>
								{#if link.icon}
									<Icon.Root icon={link.icon} />
								{/if}
								{link.label}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/each}
					</nav>
				{:else}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- external link from site-nav.ts -->
					<a
						href={entry.href}
						onclick={() => (menuOpen = false)}
						class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
					>
						{entry.label}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			{/each}
		</Sheet.Body>

		<Sheet.Footer class="justify-start">
			<Button.Root
				variant="brand"
				href="{resolve('/')}#self-hosting"
				onclick={() => (menuOpen = false)}
			>
				Get started
			</Button.Root>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
