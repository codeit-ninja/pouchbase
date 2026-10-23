<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Code from '#lib/components/ui/code/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as LinkCard from '#lib/components/ui/link-card/index.js';
	import { resolve } from '$app/paths';
	import DocsPage, { type Section } from '../docs-page.svelte';

	const sections: Section[] = [
		{ id: 'choose-how-to-run-it', title: 'Choose how to run it' },
		{ id: 'before-you-start', title: 'Before you start' }
	];

	const options = [
		{
			title: 'Cloudflare Workers',
			href: resolve('/docs/getting-started/cloudflare-workers'),
			icon: 'lucide:cloud',
			badge: 'Fastest',
			description:
				'Deploy Pouchbase as a Worker on your own account, right next to its data. No server to maintain.'
		},
		{
			title: 'Docker',
			href: resolve('/docs/getting-started/docker'),
			icon: 'simple-icons:docker',
			badge: 'Install script for a VPS',
			description:
				'Run the published image on your own server. The install script sets up Docker and HTTPS for you.'
		},
		{
			title: 'Single binary',
			href: resolve('/docs/getting-started/single-binary'),
			icon: 'lucide:terminal',
			badge: undefined,
			description:
				'Download one executable without dependencies, like PocketBase, and run it anywhere.'
		}
	];
</script>

<DocsPage
	title="Getting started"
	description="Pouchbase runs on your own Cloudflare account. Pick how you want to run it, then follow the guide for that option."
	{sections}
>
	<Callout.Root variant="warning">
		<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Pouchbase is under active development</Callout.Title>
			<Callout.Description>
				It is not yet ready for production use. APIs, the database schema and the admin interface
				may change without notice, and there is no guaranteed upgrade path between versions yet.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>

	<h2 id="choose-how-to-run-it">Choose how to run it</h2>

	<p>
		Whichever option you choose, the data lives on Cloudflare: D1 for the databases and R2 for
		uploaded files. The options differ in where the app itself runs.
	</p>

	<div class="not-prose grid gap-3">
		{#each options as option (option.href)}
			<LinkCard.Root href={option.href} class="sm:flex-row sm:items-start sm:gap-4">
				<LinkCard.Icon><Icon.Root icon={option.icon} /></LinkCard.Icon>

				<LinkCard.Body>
					<LinkCard.Header>
						<LinkCard.Title>
							{option.title}
							<Icon.Root icon="lucide:arrow-right" />
						</LinkCard.Title>

						{#if option.badge}
							<Badge.Root variant="brand">{option.badge}</Badge.Root>
						{/if}
					</LinkCard.Header>

					<LinkCard.Description>{option.description}</LinkCard.Description>
				</LinkCard.Body>
			</LinkCard.Root>
		{/each}
	</div>

	<p>
		<strong>Run it as a Worker when speed matters.</strong> A Worker queries D1 through bindings,
		inside Cloudflare's network. With Docker and the single binary, every database round-trip goes
		through the D1 HTTP API, which takes a few hundred milliseconds each. To check, set
		<Code.Root>POUCHBASE_LOG_TIMING=true</Code.Root>: every <Code.Root>[db]</Code.Root> line says whether
		a query used a <Code.Root>binding</Code.Root> or the <Code.Root>api</Code.Root>.
	</p>

	<h2 id="before-you-start">Before you start</h2>

	<p>Every option needs the same two things from Cloudflare:</p>

	<ul>
		<li>
			Your <strong>account ID</strong>. Find it in the Cloudflare dashboard under Workers & Pages,
			in the right column.
		</li>
		<li>
			An <strong>API token</strong>, created under My Profile → API Tokens, with these account-level
			permissions: Workers Scripts, D1, Workers R2 Storage and Workers KV Storage (Edit), and
			Account Settings (Read). To see the logs of functions, add Workers Observability (Edit).
		</li>
	</ul>

	<p>
		They go into <Code.Root>CLOUDFLARE_ACCOUNT_ID</Code.Root> and
		<Code.Root>CLOUDFLARE_API_TOKEN</Code.Root>; each guide shows where.
	</p>
</DocsPage>
