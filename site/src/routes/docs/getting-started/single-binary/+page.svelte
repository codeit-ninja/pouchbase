<script lang="ts">
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import { GITHUB_URL } from '../../../site-nav';
	import DocsPage, { type Section } from '../../docs-page.svelte';
	import CredentialsNote from '../credentials-note.svelte';
	import FinishInstallation from '../finish-installation.svelte';
	import ServerVariables from '../server-variables.svelte';

	const sections: Section[] = [
		{ id: 'download', title: 'Download' },
		{ id: 'run', title: 'Run' },
		{ id: 'configuration', title: 'Configuration' },
		{ id: 'updating', title: 'Updating' },
		{ id: 'finish-the-installation', title: 'Finish the installation' }
	];

	const binaries = [
		{ name: 'pouchbase-linux-x64', platform: 'Linux, x64' },
		{ name: 'pouchbase-linux-arm64', platform: 'Linux, ARM64' },
		{ name: 'pouchbase-macos-arm64', platform: 'macOS, Apple silicon' },
		{ name: 'pouchbase-windows-x64.exe', platform: 'Windows, x64' }
	];
</script>

<DocsPage
	title="Single binary"
	description="Like PocketBase, Pouchbase comes as one executable without dependencies. It keeps no files of its own: the data lives on Cloudflare."
	{sections}
>
	<CredentialsNote />

	<h2 id="download">Download</h2>

	<p>
		Every
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a href="{GITHUB_URL}/releases">release on GitHub</a> attaches a binary per platform, each with Node
		26, the app and its static files:
	</p>

	<ul>
		{#each binaries as binary (binary.name)}
			<li><Code.Root>{binary.name}</Code.Root>: {binary.platform}</li>
		{/each}
	</ul>

	<p>
		On Linux the binary needs <Code.Root>libatomic1</Code.Root>, which most distributions install by
		default. On minimal images such as <Code.Root>debian:slim</Code.Root>, install it with
		<Code.Root>apt-get install libatomic1</Code.Root>.
	</p>

	<h2 id="run">Run</h2>

	<p>
		Put <Code.Root>CLOUDFLARE_ACCOUNT_ID</Code.Root> and <Code.Root>CLOUDFLARE_API_TOKEN</Code.Root>
		in a <Code.Root>.env</Code.Root> file in the working directory, then start the server:
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>chmod +x pouchbase-linux-x64</CodeBlock.Line>
		<CodeBlock.Line>
			./pouchbase-linux-x64 serve --http=0.0.0.0:8090 --origin=https://pouchbase.example.com
		</CodeBlock.Line>
	</CodeBlock.Root>

	<p>
		For anything but local use, put a reverse proxy with HTTPS in front of it: the session cookie is
		only sent over HTTPS, except on <Code.Root>localhost</Code.Root>.
	</p>

	<h2 id="configuration">Configuration</h2>

	<p>
		The binary reads <Code.Root>.env</Code.Root> from the working directory, or the file passed with
		<Code.Root>--env-file</Code.Root>; variables in the environment work as well.
		<Code.Root>--http</Code.Root>, <Code.Root>--port</Code.Root> and <Code.Root>--origin</Code.Root>
		override <Code.Root>HOST</Code.Root>, <Code.Root>PORT</Code.Root> and <Code.Root
			>ORIGIN</Code.Root
		>
		(<Code.Root>--port=3001</Code.Root> changes only the port). Run
		<Code.Root>pouchbase --help</Code.Root> for all flags.
	</p>

	<ServerVariables />

	<h2 id="updating">Updating</h2>

	<p>
		The bottom of the admin sidebar shows when a new version is out; <strong>Update now</strong>
		installs it and restarts Pouchbase. From the command line, <Code.Root>update</Code.Root> downloads
		the latest release for your platform, checks it and replaces the executable; restart Pouchbase afterwards.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line kind="comment"># Only check whether a newer version is available</CodeBlock.Line
		>
		<CodeBlock.Line>./pouchbase-linux-x64 update --check</CodeBlock.Line>
		<CodeBlock.Line kind="comment" class="mt-5"># Download and install it</CodeBlock.Line>
		<CodeBlock.Line>./pouchbase-linux-x64 update</CodeBlock.Line>
	</CodeBlock.Root>

	<FinishInstallation />
</DocsPage>
