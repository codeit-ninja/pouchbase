<script lang="ts">
	import * as SideNav from '#lib/components/ui/side-nav/index.js';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import { docsNavigation } from './docs-nav';

	let { children }: LayoutProps = $props();
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 lg:flex-row lg:gap-12 lg:py-14">
	<aside class="lg:w-56 lg:shrink-0">
		<SideNav.Root aria-label="Documentation" class="lg:sticky lg:top-24">
			{#each docsNavigation as group (group.label)}
				<SideNav.Group>
					<SideNav.Title>{group.label}</SideNav.Title>

					{#each group.links as link (link.href)}
						<SideNav.Link href={link.href} active={page.url.pathname === link.href}>
							{link.label}
						</SideNav.Link>
					{/each}
				</SideNav.Group>
			{/each}
		</SideNav.Root>
	</aside>

	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
</div>
