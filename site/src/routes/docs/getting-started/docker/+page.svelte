<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { GITHUB_URL, INSTALL_SCRIPT_URL } from '../../../site-nav';
	import DocsPage, { type Section } from '../../docs-page.svelte';
	import CredentialsNote from '../credentials-note.svelte';
	import FinishInstallation from '../finish-installation.svelte';
	import ServerVariables from '../server-variables.svelte';

	const sections: Section[] = [
		{ id: 'install-script', title: 'Install script' },
		{ id: 'docker-compose', title: 'Docker Compose' },
		{ id: 'docker-run', title: 'docker run' },
		{ id: 'environment-variables', title: 'Environment variables' },
		{ id: 'finish-the-installation', title: 'Finish the installation' }
	];
</script>

<DocsPage
	title="Docker"
	description="Run Pouchbase on your own server with the published Docker image. The data still lives on Cloudflare, so the container keeps no state of its own."
	{sections}
>
	<CredentialsNote />

	<h2 id="install-script">Install script</h2>

	<p>The quickest way onto a fresh Linux server (a VPS) is the install script. Run it as root:</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>curl -fsSL {INSTALL_SCRIPT_URL} | sudo bash</CodeBlock.Line>
	</CodeBlock.Root>

	<p>The script:</p>

	<ol>
		<li>Installs Docker with the official script from get.docker.com, if it is missing.</li>
		<li>
			Asks for your Cloudflare account ID and API token, and checks them against the Cloudflare API.
		</li>
		<li>
			Asks for a domain name. With one, Caddy runs in front of Pouchbase and gets an HTTPS
			certificate from Let's Encrypt; point an A record for the domain to the server first.
		</li>
		<li>
			Writes <Code.Root>.env</Code.Root> and <Code.Root>docker-compose.yml</Code.Root> to
			<Code.Root>/opt/pouchbase</Code.Root> and starts Pouchbase.
		</li>
	</ol>

	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:lock" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Without a domain, Pouchbase only listens on localhost</Callout.Title>
			<Callout.Description>
				The session cookie is only sent over HTTPS, except on <Code.Root>localhost</Code.Root>.
				Without a domain, reach Pouchbase through an SSH tunnel, such as
				<Code.Root>ssh -L 3000:localhost:3000 root@your-server</Code.Root>, and open
				<Code.Root>http://localhost:3000</Code.Root>.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>

	<p>
		The bottom of the admin sidebar shows when a new version is out, with the command to update. Run
		the script again to change the settings or to update to the latest image; the answers of the
		previous run are the defaults. To install without questions, set the answers as environment
		variables: <Code.Root>CLOUDFLARE_ACCOUNT_ID</Code.Root>,
		<Code.Root>CLOUDFLARE_API_TOKEN</Code.Root> and <Code.Root>POUCHBASE_DOMAIN</Code.Root> (or
		<Code.Root>none</Code.Root>). <Code.Root>POUCHBASE_DIR</Code.Root> and
		<Code.Root>POUCHBASE_VERSION</Code.Root> change the install directory and the image tag.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line kind="comment"># Follow the logs</CodeBlock.Line>
		<CodeBlock.Line>cd /opt/pouchbase && docker compose logs -f pouchbase</CodeBlock.Line>
		<CodeBlock.Line kind="comment" class="mt-5"># Update to the latest version</CodeBlock.Line>
		<CodeBlock.Line>docker compose pull && docker compose up -d</CodeBlock.Line>
	</CodeBlock.Root>

	<h2 id="docker-compose">Docker Compose</h2>

	<p>
		To set it up yourself, use the <Code.Root>docker-compose.yml</Code.Root> in the repository. Create
		a <Code.Root>.env</Code.Root> file next to it with <Code.Root>CLOUDFLARE_ACCOUNT_ID</Code.Root> and
		<Code.Root>CLOUDFLARE_API_TOKEN</Code.Root>; Compose reads the credentials from it.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>git clone {GITHUB_URL}.git</CodeBlock.Line>
		<CodeBlock.Line>cd pouchbase</CodeBlock.Line>
		<CodeBlock.Line>cp .env.example .env</CodeBlock.Line>
		<CodeBlock.Line>ORIGIN=https://pouchbase.example.com docker compose up -d</CodeBlock.Line>
	</CodeBlock.Root>

	<p>
		<Code.Root>ORIGIN</Code.Root> is the public URL of the instance and defaults to
		<Code.Root>http://localhost:3000</Code.Root>. For anything but local use, put a reverse proxy
		with HTTPS (Caddy, Traefik, nginx) in front of port 3000.
	</p>

	<h2 id="docker-run">docker run</h2>

	<p>
		Every release publishes an image for <Code.Root>linux/amd64</Code.Root> and
		<Code.Root>linux/arm64</Code.Root> to GitHub Container Registry, tagged with its version (such as
		<Code.Root>0.2.1</Code.Root> and <Code.Root>0.2</Code.Root>) and <Code.Root>latest</Code.Root>.
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
		<Code.Root>x-forwarded-host</Code.Root>, <Code.Root>ORIGIN</Code.Root> can be left out.
	</p>

	<h2 id="environment-variables">Environment variables</h2>

	<ServerVariables />

	<FinishInstallation />
</DocsPage>
