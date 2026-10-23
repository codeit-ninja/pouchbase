<script lang="ts">
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import { GITHUB_URL } from '../../../site-nav';
	import DocsPage, { type Section } from '../../docs-page.svelte';
	import CredentialsNote from '../credentials-note.svelte';
	import FinishInstallation from '../finish-installation.svelte';

	const sections: Section[] = [
		{ id: 'requirements', title: 'Requirements' },
		{ id: 'deploy', title: 'Deploy' },
		{ id: 'updating', title: 'Updating' },
		{ id: 'finish-the-installation', title: 'Finish the installation' }
	];
</script>

<DocsPage
	title="Cloudflare Workers"
	description="Deploy Pouchbase as a Worker on your own Cloudflare account, right next to its data. The fastest way to run it."
	{sections}
>
	<CredentialsNote />

	<h2 id="requirements">Requirements</h2>

	<ul>
		<li>Node 22 or later.</li>
		<li>pnpm; run <Code.Root>corepack enable</Code.Root> to get the right version.</li>
	</ul>

	<h2 id="deploy">Deploy</h2>

	<ol>
		<li>Clone the repository and install the dependencies.</li>
		<li>
			Copy <Code.Root>.env.example</Code.Root> to <Code.Root>.env</Code.Root> and fill in
			<Code.Root>CLOUDFLARE_ACCOUNT_ID</Code.Root> and <Code.Root>CLOUDFLARE_API_TOKEN</Code.Root>.
			Run <Code.Root>pnpm cf:whoami</Code.Root> to check that they point to the right account.
		</li>
		<li>
			Build and deploy the Worker. <Code.Root>--secrets-file .env</Code.Root> stores the variables from
			<Code.Root>.env</Code.Root> as Worker secrets in the same step.
		</li>
		<li>Open the Worker URL that Wrangler prints.</li>
	</ol>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>git clone {GITHUB_URL}.git</CodeBlock.Line>
		<CodeBlock.Line>cd pouchbase</CodeBlock.Line>
		<CodeBlock.Line>pnpm install</CodeBlock.Line>
		<CodeBlock.Line>cp .env.example .env</CodeBlock.Line>
		<CodeBlock.Line kind="comment" class="mt-5">
			# Fill in CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then:
		</CodeBlock.Line>
		<CodeBlock.Line>pnpm build</CodeBlock.Line>
		<CodeBlock.Line>pnpm wrangler deploy --secrets-file .env</CodeBlock.Line>
		<CodeBlock.Line kind="output" class="mt-5">
			✓ Deployed to https://pouchbase.you.workers.dev
		</CodeBlock.Line>
	</CodeBlock.Root>

	<p>
		After the installation, the Worker adds a D1 binding for each database to itself, so queries
		stay inside Cloudflare's network.
	</p>

	<h2 id="updating">Updating</h2>

	<p>
		The quickest way to update is <strong>Update now</strong> in the admin interface: the bottom of the
		sidebar shows when a new version is out, and Pouchbase deploys it to its own Worker, keeping its databases
		and secrets.
	</p>

	<p>
		To update from your machine instead, pull the new version, then build and deploy again. Database
		migrations run automatically on the first request after a deploy. Secrets stay on the Worker
		across deploys; pass
		<Code.Root>--secrets-file .env</Code.Root> again only when you change them.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>git pull</CodeBlock.Line>
		<CodeBlock.Line>pnpm install</CodeBlock.Line>
		<CodeBlock.Line>pnpm build</CodeBlock.Line>
		<CodeBlock.Line>pnpm wrangler deploy</CodeBlock.Line>
	</CodeBlock.Root>

	<FinishInstallation />
</DocsPage>
