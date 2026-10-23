<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { resolve } from '$app/paths';
	import { GITHUB_URL } from './site-nav';

	const steps = [
		{
			title: 'Clone and install',
			text: 'You need a Cloudflare account, Node 22 or later and pnpm 10.'
		},
		{
			title: 'Add your Cloudflare credentials',
			text: 'Set your account ID and an API token in .env, then store them as Worker secrets.'
		},
		{
			title: 'Build and deploy',
			text: 'Wrangler publishes the Worker to your account.'
		},
		{
			title: 'Open the Worker URL',
			text: 'The setup wizard creates the D1 databases and your admin account. Migrations run automatically after every deploy.'
		}
	];
</script>

<section id="self-hosting" class="scroll-mt-20 border-t border-zinc-200">
	<div
		class="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:gap-16 lg:py-28"
	>
		<div class="flex flex-col gap-8">
			<div class="flex flex-col gap-4">
				<h2
					class="font-display text-3xl leading-tight font-semibold tracking-tight text-zinc-950 sm:text-4xl"
				>
					Self-host in four steps.
				</h2>
				<p class="text-lg text-zinc-600">
					Pouchbase is a single Worker. Deploy it once and manage everything from the admin
					interface. Prefer your own server? It also runs with Docker or as a single binary.
				</p>
			</div>

			<ol class="flex flex-col gap-5">
				{#each steps as step, index (step.title)}
					<li class="flex gap-4">
						<span
							class="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 font-mono text-sm font-medium text-white"
						>
							{index + 1}
						</span>
						<div class="flex flex-col gap-1 pt-0.5">
							<h3 class="font-semibold text-zinc-950">{step.title}</h3>
							<p class="text-sm text-zinc-600">{step.text}</p>
						</div>
					</li>
				{/each}
			</ol>

			<div>
				<Button.Root variant="secondary" href={resolve('/docs/getting-started')}>
					Read the full guide
					<Icon.Root icon="lucide:arrow-right" />
				</Button.Root>
			</div>
		</div>

		<CodeBlock.Root title="Terminal">
			<CodeBlock.Line>git clone {GITHUB_URL}.git</CodeBlock.Line>
			<CodeBlock.Line>cd pouchbase</CodeBlock.Line>
			<CodeBlock.Line>pnpm install</CodeBlock.Line>
			<CodeBlock.Line kind="comment" class="mt-5">
				# Add your Cloudflare account ID and API token
			</CodeBlock.Line>
			<CodeBlock.Line>cp .env.example .env</CodeBlock.Line>
			<CodeBlock.Line kind="comment" class="mt-5">
				# Build, then deploy with them as Worker secrets
			</CodeBlock.Line>
			<CodeBlock.Line>pnpm build</CodeBlock.Line>
			<CodeBlock.Line>pnpm wrangler deploy --secrets-file .env</CodeBlock.Line>
			<CodeBlock.Line kind="output" class="mt-5">
				✓ Deployed to https://pouchbase.you.workers.dev
			</CodeBlock.Line>
		</CodeBlock.Root>
	</div>
</section>
