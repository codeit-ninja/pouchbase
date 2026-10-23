<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { GITHUB_URL } from '../../site-nav';
	import DocsPage, { type Section } from '../docs-page.svelte';

	const sections: Section[] = [
		{ id: 'before-you-start', title: 'Before you start' },
		{ id: 'choose-how-to-run-it', title: 'Choose how to run it' },
		{ id: 'cloudflare-workers', title: 'Cloudflare Workers' },
		{ id: 'docker', title: 'Docker' },
		{ id: 'single-binary', title: 'Single binary' },
		{ id: 'finish-the-installation', title: 'Finish the installation' }
	];

	const variables = [
		{
			name: 'CLOUDFLARE_ACCOUNT_ID',
			fallback: '–',
			description: 'Cloudflare account that holds the D1 databases and the R2 bucket'
		},
		{
			name: 'CLOUDFLARE_API_TOKEN',
			fallback: '–',
			description: 'API token with the permissions listed above'
		},
		{
			name: 'ORIGIN',
			fallback: '–',
			description: 'Public URL of the instance, used for redirects and OAuth callbacks'
		},
		{ name: 'PORT', fallback: '3000', description: 'Port the server listens on' },
		{
			name: 'BODY_SIZE_LIMIT',
			fallback: '16M',
			description: 'Largest accepted request body (uploads are limited to 10 MB by the app)'
		},
		{
			name: 'POUCHBASE_LOG_TIMING',
			fallback: 'false',
			description: 'true logs the duration of every request and database round-trip'
		}
	];

	const binaries = [
		'pouchbase-linux-x64',
		'pouchbase-linux-arm64',
		'pouchbase-macos-arm64',
		'pouchbase-windows-x64.exe'
	];
</script>

<DocsPage
	title="Getting started"
	description="Run Pouchbase on your own Cloudflare account: as a Worker, with Docker or as a single binary."
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

	<h2 id="before-you-start">Before you start</h2>

	<p>
		Pouchbase keeps its data on Cloudflare, whichever way you run the app itself: D1 for the
		databases and R2 for uploaded files, all through the Cloudflare API. Every option needs:
	</p>

	<ul>
		<li>A Cloudflare account, and its <strong>account ID</strong>.</li>
		<li>
			An <strong>API token</strong> with these account-level permissions: Workers Scripts, D1, Workers
			R2 Storage and Workers KV Storage (Edit), and Account Settings (Read). To see the logs of functions,
			add Workers Observability (Edit).
		</li>
	</ul>

	<p>
		Both go into <Code.Root>CLOUDFLARE_ACCOUNT_ID</Code.Root> and
		<Code.Root>CLOUDFLARE_API_TOKEN</Code.Root>. Most options read them from a
		<Code.Root>.env</Code.Root> file, which you create from <Code.Root>.env.example</Code.Root> in the
		repository.
	</p>

	<h2 id="choose-how-to-run-it">Choose how to run it</h2>

	<ul>
		<li>
			<a href="#cloudflare-workers">Cloudflare Workers</a>: Pouchbase runs on Cloudflare's network,
			next to its data. The fastest option.
		</li>
		<li>
			<a href="#docker">Docker</a>: a Node server on your own machine, with Docker Compose or a
			single
			<Code.Root>docker run</Code.Root>.
		</li>
		<li>
			<a href="#single-binary">Single binary</a>: one executable without dependencies.
		</li>
	</ul>

	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:zap" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Run it as a Worker when speed matters</Callout.Title>
			<Callout.Description>
				A Worker queries D1 through bindings, inside Cloudflare's network. With Docker and the
				single binary, every database round-trip goes through the D1 HTTP API, which takes a few
				hundred milliseconds each. To check, set <Code.Root>POUCHBASE_LOG_TIMING=true</Code.Root>:
				every <Code.Root>[db]</Code.Root> line says whether a query used a
				<Code.Root>binding</Code.Root> or the <Code.Root>api</Code.Root>.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>

	<h2 id="cloudflare-workers">Cloudflare Workers</h2>

	<p>You need Node 22 or later and pnpm 10 (<Code.Root>corepack enable</Code.Root>).</p>

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
		<li>Open the Worker URL.</li>
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
		Secrets stay on the Worker across deploys; pass <Code.Root>--secrets-file .env</Code.Root> again when
		you change them. Database migrations run automatically after every deploy.
	</p>

	<h2 id="docker">Docker</h2>

	<p>
		The Docker image runs Pouchbase as a Node server. Its data still lives on Cloudflare, so the
		container keeps no state of its own.
	</p>

	<h3 id="docker-compose">Docker Compose</h3>

	<p>
		You need Docker with Compose, and the <Code.Root>.env</Code.Root> file from above next to
		<Code.Root>docker-compose.yml</Code.Root>; Compose reads the credentials from it.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>git clone {GITHUB_URL}.git</CodeBlock.Line>
		<CodeBlock.Line>cd pouchbase</CodeBlock.Line>
		<CodeBlock.Line>ORIGIN=https://pouchbase.example.com docker compose up -d</CodeBlock.Line>
	</CodeBlock.Root>

	<p>
		<Code.Root>ORIGIN</Code.Root> is the public URL of the instance and defaults to
		<Code.Root>http://localhost:3000</Code.Root>. For anything but local use, put a reverse proxy
		with HTTPS (Caddy, Traefik, nginx) in front of port 3000: the session cookie is only sent over
		HTTPS, except on <Code.Root>localhost</Code.Root>.
	</p>

	<h3 id="docker-run">docker run</h3>

	<p>
		Every release publishes an image for <Code.Root>linux/amd64</Code.Root> and
		<Code.Root>linux/arm64</Code.Root> to GitHub Container Registry, tagged with its version and
		<Code.Root>latest</Code.Root>.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>docker run -d --name pouchbase -p 3000:3000 \</CodeBlock.Line>
		<CodeBlock.Line kind="continued">-e ORIGIN=https://pouchbase.example.com \</CodeBlock.Line>
		<CodeBlock.Line kind="continued">-e CLOUDFLARE_ACCOUNT_ID=... \</CodeBlock.Line>
		<CodeBlock.Line kind="continued">-e CLOUDFLARE_API_TOKEN=... \</CodeBlock.Line>
		<CodeBlock.Line kind="continued">ghcr.io/pouchbase/pouchbase:latest</CodeBlock.Line>
	</CodeBlock.Root>

	<p>
		The container answers a health check at <Code.Root>/api/health</Code.Root>. Behind a reverse
		proxy that sends <Code.Root>x-forwarded-proto</Code.Root> and
		<Code.Root>x-forwarded-host</Code.Root>, <Code.Root>ORIGIN</Code.Root> can be left out. These variables
		configure the server, with Docker and the single binary alike:
	</p>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Variable</Table.Head>
				<Table.Head>Default</Table.Head>
				<Table.Head>Description</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each variables as variable (variable.name)}
				<Table.Row>
					<Table.Cell><Code.Root>{variable.name}</Code.Root></Table.Cell>
					<Table.Cell>{variable.fallback}</Table.Cell>
					<Table.Cell>{variable.description}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<h2 id="single-binary">Single binary</h2>

	<p>
		Pouchbase also comes as one executable without dependencies. Every
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a href="{GITHUB_URL}/releases">release</a> attaches a binary per platform, each with Node 26, the
		app and its static files:
	</p>

	<ul>
		{#each binaries as binary (binary)}
			<li><Code.Root>{binary}</Code.Root></li>
		{/each}
	</ul>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>chmod +x pouchbase-linux-x64</CodeBlock.Line>
		<CodeBlock.Line>
			./pouchbase-linux-x64 serve --http=0.0.0.0:8090 --origin=https://pouchbase.example.com
		</CodeBlock.Line>
	</CodeBlock.Root>

	<p>
		The binary reads <Code.Root>.env</Code.Root> from the working directory (or the file passed with
		<Code.Root>--env-file</Code.Root>), so put <Code.Root>CLOUDFLARE_ACCOUNT_ID</Code.Root> and
		<Code.Root>CLOUDFLARE_API_TOKEN</Code.Root> there or in the environment.
		<Code.Root>--http</Code.Root>, <Code.Root>--port</Code.Root> and <Code.Root>--origin</Code.Root> override
		<Code.Root>HOST</Code.Root>, <Code.Root>PORT</Code.Root> and <Code.Root>ORIGIN</Code.Root>; the
		other variables from the <a href="#docker-run">table above</a> apply as well. Run
		<Code.Root>pouchbase --help</Code.Root> for all flags.
	</p>

	<p>
		On Linux the binary needs <Code.Root>libatomic1</Code.Root>, which most distributions install by
		default. On minimal images such as <Code.Root>debian:slim</Code.Root>, install it with
		<Code.Root>apt-get install libatomic1</Code.Root>.
	</p>

	<h2 id="finish-the-installation">Finish the installation</h2>

	<p>
		Whichever option you chose, the first visit redirects to <Code.Root>/install</Code.Root>, a
		two-step wizard:
	</p>

	<ol>
		<li>
			<strong>Account</strong>: creates the D1 databases through the Cloudflare API, then your admin
			account. You are signed in right away.
		</li>
		<li>
			<strong>App settings</strong>: choose the name of your app. This completes the installation.
		</li>
	</ol>

	<p>
		From there, everything is managed in the admin interface: collections, users and sign-in, files,
		backups and functions. The
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a href="{GITHUB_URL}#readme">README on GitHub</a> covers each of them in detail.
	</p>
</DocsPage>
