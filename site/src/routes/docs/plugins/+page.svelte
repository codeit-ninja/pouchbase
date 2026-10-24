<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import DocsPage, { type Section } from '../docs-page.svelte';

	let { data }: PageProps = $props();

	const sections: Section[] = [
		{ id: 'create-a-plugin', title: 'Create a plugin' },
		{ id: 'the-manifest', title: 'The manifest' },
		{ id: 'server-code', title: 'Server code' },
		{ id: 'ui-components', title: 'UI components' },
		{ id: 'test-locally', title: 'Test locally' },
		{ id: 'publish', title: 'Publish' },
		{ id: 'install', title: 'Install a plugin' },
		{ id: 'versions-and-compatibility', title: 'Versions and compatibility' }
	];
</script>

<DocsPage
	title="Plugins"
	description="Add field types, dashboard pages and sign-in providers to Pouchbase, and publish them to the plugin registry so any installation can install them without a rebuild."
	{sections}
>
	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:info" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Plugin API version 1</Callout.Title>
			<Callout.Description>
				Pouchbase can already search, install and remove plugins. Running their contributions
				(fields, pages and sign-in providers) follows in upcoming releases.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>

	<h2 id="create-a-plugin">Create a plugin</h2>

	<p>
		Plugins are built with <a href="https://www.npmjs.com/package/@pouchbasejs/plugin-sdk"
			><Code.Root>@pouchbasejs/plugin-sdk</Code.Root></a
		>, which has the types, the manifest schema and the <Code.Root>pouchbase-plugin</Code.Root> CLI. Start
		a new plugin with <Code.Root>init</Code.Root>; the directory name becomes the plugin's id:
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.init} />
	</CodeBlock.Root>

	<p>A plugin is a manifest, optional server code and the Svelte components it adds:</p>

	<CodeBlock.Root>
		<CodeBlock.Source code={data.code.layout} />
	</CodeBlock.Root>

	<h2 id="the-manifest">The manifest</h2>

	<p>
		<Code.Root>pouchbase-plugin.json</Code.Root> describes the plugin and everything it adds:
	</p>

	<CodeBlock.Root title="pouchbase-plugin.json">
		<CodeBlock.Source code={data.code.manifest} />
	</CodeBlock.Root>

	<ul>
		<li>
			<Code.Root>id</Code.Root> is unique in the registry: lowercase words separated by dashes. Everything
			the plugin adds is namespaced by it, such as the field type
			<Code.Root>color-picker:color</Code.Root> and the page <Code.Root
				>/plugins/color-picker/palette</Code.Root
			>.
		</li>
		<li><Code.Root>version</Code.Root> is the exact semver version of this release.</li>
		<li>
			<Code.Root>engines.pouchbase</Code.Root> is the semver range of Pouchbase versions the plugin works
			with.
		</li>
		<li>
			<Code.Root>permissions.network</Code.Root> lists the hosts the server code may reach;
			<Code.Root>*.example.com</Code.Root> includes subdomains. The admin sees them before installing.
		</li>
		<li>
			<Code.Root>server</Code.Root> is the entry of the server code, required for sign-in providers.
		</li>
		<li>
			<Code.Root>contributes</Code.Root> lists what the plugin adds: <Code.Root>fields</Code.Root>,
			<Code.Root>pages</Code.Root> and <Code.Root>authProviders</Code.Root>. Every component lives
			in <Code.Root>ui/</Code.Root>.
		</li>
	</ul>

	<h2 id="server-code">Server code</h2>

	<p>
		The server code validates field values and serves the plugin's own routes. It runs in a sandbox,
		a Dynamic Worker on Cloudflare: it can't import Node.js modules or reach the network, except
		through <Code.Root>ctx.fetch</Code.Root> to the hosts in
		<Code.Root>permissions.network</Code.Root>. Bundle npm packages into it; the CLI does that on
		<Code.Root>build</Code.Root>.
	</p>

	<CodeBlock.Root title="server/index.ts">
		<CodeBlock.Source code={data.code.server} />
	</CodeBlock.Root>

	<h2 id="ui-components">UI components</h2>

	<p>
		Pouchbase compiles the plugin's <Code.Root>.svelte</Code.Root> files with its own Svelte compiler
		on install and renders them in the dashboard. They get their props from
		<Code.Root>@pouchbasejs/plugin-sdk/ui</Code.Root>: <Code.Root>FieldInputProps</Code.Root> for the
		input of a field in the record form, <Code.Root>FieldCellProps</Code.Root> for its cell in the records
		table and <Code.Root>PageProps</Code.Root> for a page, which calls the plugin's routes with <Code.Root
			>api.fetch</Code.Root
		>.
	</p>

	<CodeBlock.Root title="ui/color-input.svelte">
		<CodeBlock.Source code={data.code.component} />
	</CodeBlock.Root>

	<p>
		Components may import <Code.Root>svelte</Code.Root>, <Code.Root>svelte/*</Code.Root>,
		<Code.Root>@pouchbasejs/plugin-sdk/ui</Code.Root> and other files in <Code.Root>ui/</Code.Root>,
		nothing else. TypeScript modules in <Code.Root>ui/</Code.Root> are compiled to JavaScript by the CLI.
	</p>

	<h2 id="test-locally">Test locally</h2>

	<p>
		<Code.Root>pnpm dev</Code.Root> (<Code.Root>pouchbase-plugin dev</Code.Root>) rebuilds the
		plugin on every change and serves it from a local registry on port 4510 (<Code.Root
			>--port</Code.Root
		>
		to change it). Point a Pouchbase installation at it with a
		<a href={resolve('/docs/getting-started')}>server variable</a>, then install the plugin from the
		<strong>Plugins</strong> page of the dashboard:
	</p>

	<CodeBlock.Root title=".env">
		<CodeBlock.Source code={data.code.devRegistry} />
	</CodeBlock.Root>

	<h2 id="publish">Publish</h2>

	<p>
		Published plugins are listed in the public registry on pouchbase.io, which every Pouchbase
		installation searches by default. To publish, you need an account on
		<a href={resolve('/account')}>pouchbase.io</a>. The first version of a plugin makes its id
		yours; after that, only you can publish new versions of it.
	</p>

	<p>First check the plugin and build its bundle:</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.build} />
	</CodeBlock.Root>

	<p>
		<Code.Root>build</Code.Root> writes one JSON file to <Code.Root>dist/</Code.Root>: the manifest,
		the bundled server code and the <Code.Root>ui/</Code.Root> files, at most 1 MiB. Then publish it in
		one of two ways:
	</p>

	<ul>
		<li>
			<strong>Upload it.</strong> Under <a href={resolve('/account')}>Account</a>, upload the bundle
			in <strong>Publish a version</strong>.
		</li>
		<li>
			<strong>With the CLI.</strong> Create a token under <strong>Publish tokens</strong> on the
			account page and set it as <Code.Root>POUCHBASE_REGISTRY_TOKEN</Code.Root>.
			<Code.Root>publish</Code.Root> builds the plugin and uploads the bundle:
		</li>
	</ul>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.publish} />
	</CodeBlock.Root>

	<p>
		A token publishes as you, so keep it secret. In CI, store it as a secret and publish on every
		release:
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.ci} />
	</CodeBlock.Root>

	<p>The registry refuses a version when:</p>

	<ul>
		<li>
			the bundle isn't valid or is for an API version it doesn't know (<Code.Root>422</Code.Root>);
		</li>
		<li>the plugin id belongs to another account (<Code.Root>403</Code.Root>);</li>
		<li>
			that version is already published (<Code.Root>409</Code.Root>): published versions never
			change, so bump <Code.Root>version</Code.Root> in the manifest for every release.
		</li>
	</ul>

	<p>
		To publish somewhere else, pass <Code.Root>--registry &lt;url&gt;</Code.Root> or set
		<Code.Root>POUCHBASE_REGISTRY_URL</Code.Root>. Any server that implements the registry API in
		the
		<a href="https://github.com/pouchbase/pouchbase/tree/main/packages/plugin-sdk#registry-api"
			>SDK README</a
		> can be a registry.
	</p>

	<h2 id="install">Install a plugin</h2>

	<p>
		Admins search and install plugins on the <strong>Plugins</strong> page of the dashboard, which
		shows the network hosts a plugin asks for before installing. Pouchbase downloads the bundle,
		checks it against the integrity hash (<Code.Root>sha256-…</Code.Root>) the registry lists for
		that version and refuses it when it doesn't match. An installation uses another registry when
		its
		<Code.Root>PLUGIN_REGISTRY_URL</Code.Root> server variable is set.
	</p>

	<h2 id="versions-and-compatibility">Versions and compatibility</h2>

	<ul>
		<li>
			<Code.Root>apiVersion</Code.Root> covers the whole contract: the manifest, the bundle format, the
			server API and the component props.
		</li>
		<li>
			Within an API version, changes are only additive. Pouchbase ignores what it doesn't know, so a
			plugin that needs something added later sets <Code.Root>engines.pouchbase</Code.Root>.
		</li>
		<li>
			A change that would break plugins bumps the API version. Pouchbase supports the current API
			version and the one before it, and refuses plugins it can't run.
		</li>
	</ul>

	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:scale" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Any license</Callout.Title>
			<Callout.Description>
				The plugin SDK is MIT-licensed, and plugins may use any license under the
				<a href="https://github.com/pouchbase/pouchbase/blob/main/PLUGIN-EXCEPTION.md"
					>Pouchbase Plugin Exception</a
				>.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>
</DocsPage>
