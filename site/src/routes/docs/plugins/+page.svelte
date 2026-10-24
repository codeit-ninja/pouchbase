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
		{ id: 'sign-in-providers', title: 'Sign-in providers' },
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
				Pouchbase searches, installs and removes plugins and runs their sign-in providers; the
				built-in Google, GitHub, Microsoft, Discord and Twitch sign-in are plugins too. Running
				field types and pages follows in upcoming releases.
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

	<p>
		In a terminal, <Code.Root>init</Code.Root> asks which template to start from; pass
		<Code.Root>--template</Code.Root> to choose it up front (without a terminal it uses
		<Code.Root>field</Code.Root>):
	</p>

	<ul>
		<li><Code.Root>field</Code.Root>: a color field type with validation on the server.</li>
		<li>
			<Code.Root>page</Code.Root>: a dashboard page that calls the plugin's
			<Code.Root>GET /hello</Code.Root> route.
		</li>
		<li>
			<Code.Root>auth-provider</Code.Root>: a sign-in provider built with
			<Code.Root>createOidcProvider</Code.Root>; a plugin named <Code.Root>auth-gitlab</Code.Root> gets
			the provider <Code.Root>gitlab</Code.Root>.
		</li>
		<li><Code.Root>empty</Code.Root>: only the manifest.</li>
	</ul>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.templates} />
	</CodeBlock.Root>

	<p>
		Every template sets <Code.Root>$schema</Code.Root> and <Code.Root>categories</Code.Root> in the manifest
		and keeps the version in <Code.Root>package.json</Code.Root>. Add more to a plugin later with
		<Code.Root>add</Code.Root>: it appends the contribution to the manifest and creates its files,
		without overwriting any. When the plugin already has server code, it tells you which handler to
		add.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.add} />
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
			<Code.Root>categories</Code.Root> lists up to three of <Code.Root>auth</Code.Root>,
			<Code.Root>fields</Code.Root>, <Code.Root>pages</Code.Root>,
			<Code.Root>integrations</Code.Root> and <Code.Root>developer-tools</Code.Root>, so people find
			the plugin on the <a href={resolve('/plugins')}>plugins page</a> and the Plugins page of their dashboard.
			Without it, the registry picks them from what the plugin contributes.
		</li>
		<li>
			<Code.Root>engines.pouchbase</Code.Root> is the semver range of Pouchbase versions the plugin works
			with.
		</li>
		<li>
			<Code.Root>permissions.network</Code.Root> lists the hosts the server code may reach over HTTPS;
			<Code.Root>*.example.com</Code.Root> matches its subdomains, not <Code.Root
				>example.com</Code.Root
			>
			itself. The admin sees them before installing.
		</li>
		<li>
			<Code.Root>server</Code.Root> is the entry of the server code, required for sign-in providers.
		</li>
		<li>
			<Code.Root>contributes</Code.Root> lists what the plugin adds: <Code.Root>fields</Code.Root>,
			<Code.Root>pages</Code.Root> and <Code.Root>authProviders</Code.Root>. Every component lives
			in <Code.Root>ui/</Code.Root>.
		</li>
		<li>
			<Code.Root>$schema</Code.Root> points editors at the
			<a href={resolve('/schemas/plugin-manifest.json')}>JSON Schema of the manifest</a>, for
			completion and checks while you type. <Code.Root>pouchbase-plugin schema</Code.Root> prints the
			same schema.
		</li>
	</ul>

	<p>
		<Code.Root>name</Code.Root>, <Code.Root>version</Code.Root>, <Code.Root>description</Code.Root>,
		<Code.Root>license</Code.Root>, <Code.Root>author</Code.Root>, <Code.Root>homepage</Code.Root>,
		<Code.Root>repository</Code.Root> and <Code.Root>keywords</Code.Root> may be left out of the manifest
		when the plugin's <Code.Root>package.json</Code.Root> has them; the CLI fills them in, and a value
		in the manifest wins. That way the version lives in one place:
	</p>

	<CodeBlock.Root title="package.json">
		<CodeBlock.Source code={data.code.packageDefaults} />
	</CodeBlock.Root>

	<h2 id="server-code">Server code</h2>

	<p>
		The server code validates field values and serves the plugin's own routes. It runs in its own
		Worker on your Cloudflare account (built-in plugins, which ship with Pouchbase, run inside
		Pouchbase): it can't import Node.js modules or reach the network, except through
		<Code.Root>ctx.fetch</Code.Root> to the HTTPS hosts in <Code.Root>permissions.network</Code.Root
		>. The Worker has no bindings, its global <Code.Root>fetch</Code.Root> has the same limits, and redirects
		are returned instead of followed. Bundle npm packages into it; the CLI does that on
		<Code.Root>build</Code.Root>. The bundled code may not import anything, not even
		<Code.Root>cloudflare:*</Code.Root> or <Code.Root>node:*</Code.Root> modules: the CLI, the registry
		and Pouchbase all refuse a bundle whose server code still has an <Code.Root>import</Code.Root>.
	</p>

	<CodeBlock.Root title="server/index.ts">
		<CodeBlock.Source code={data.code.server} />
	</CodeBlock.Root>

	<h2 id="sign-in-providers">Sign-in providers</h2>

	<p>
		A sign-in provider tells Pouchbase where to send people to sign in and how to read their
		profile. Pouchbase handles the redirects and the token exchange; the plugin's
		<Code.Root>profile</Code.Root> function gets the access token and returns the user. For an OpenID
		Connect provider, <Code.Root>createOidcProvider</Code.Root> reads the profile from its userinfo endpoint;
		scopes default to <Code.Root>openid email profile</Code.Root> and PKCE is on, and
		<Code.Root>mapProfile</Code.Root> adjusts the result, for example when the provider doesn't verify
		emails. For other APIs, <Code.Root>fetchJson</Code.Root> sends the access token and throws when the
		request fails:
	</p>

	<CodeBlock.Root title="server/index.ts">
		<CodeBlock.Source code={data.code.authProvider} />
	</CodeBlock.Root>

	<p>
		Only set <Code.Root>emailVerified</Code.Root> when the provider guarantees the email belongs to the
		user: a verified email links a sign-in to an existing user with that email. Add the hosts the profile
		comes from to <Code.Root>permissions.network</Code.Root>. To type a field type or provider in
		its own file, wrap it in <Code.Root>defineField</Code.Root> or
		<Code.Root>defineAuthProvider</Code.Root>.
	</p>

	<p>
		The provider's <Code.Root>id</Code.Root> in <Code.Root>contributes.authProviders</Code.Root> is its
		public id, such as <Code.Root>gitlab</Code.Root>, used as is in the sign-in URLs and the API.
		Pouchbase refuses to install a plugin whose provider id another plugin already contributes,
		including the built-in plugins for Google, GitHub, Microsoft, Discord and Twitch. The ids
		<Code.Root>password</Code.Root>, <Code.Root>email</Code.Root> and <Code.Root>otp</Code.Root> are
		reserved for Pouchbase's own sign-in methods. Pouchbase reads the provider's URLs, scopes and PKCE
		setting once, when the plugin is installed. Its
		optional <Code.Root>icon</Code.Root> is an SVG in <Code.Root>ui/</Code.Root>, such as
		<Code.Root>ui/gitlab.svg</Code.Root>, shown on the sign-in button and in the settings.
	</p>

	<p>
		The built-in sign-in providers are ordinary plugins in the
		<a href="https://github.com/pouchbase/pouchbase/tree/main/plugins"
			><Code.Root>plugins/</Code.Root> folder</a
		> of the Pouchbase repository, built with the same SDK. They are good examples to start from:
		<Code.Root>auth-github</Code.Root> reads a REST API with <Code.Root>fetchJson</Code.Root>, and
		<Code.Root>auth-twitch</Code.Root> sends the client id along.
	</p>

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
		<Code.Root>@pouchbasejs/plugin-sdk/ui</Code.Root>, the dashboard's own components from
		<Code.Root>@pouchbasejs/ui</Code.Root> (such as <Code.Root>@pouchbasejs/ui/button</Code.Root>)
		and other files in <Code.Root>ui/</Code.Root>, nothing else. Pouchbase provides these modules at
		runtime, so a plugin never ships its own copy; install them as devDependencies for type
		checking. TypeScript modules in <Code.Root>ui/</Code.Root> are compiled to JavaScript by the CLI.
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

	<p>
		Every build is served as a new prerelease, <Code.Root>&lt;version&gt;-dev.&lt;n&gt;</Code.Root>,
		so Pouchbase sees it as an update of the build it installed. Pass
		<Code.Root>--exact-version</Code.Root> to serve the version from the manifest as is.
	</p>

	<h2 id="publish">Publish</h2>

	<p>
		Published plugins are listed in the public registry on pouchbase.io, which every Pouchbase
		installation searches by default. To publish, you need an account on
		<a href={resolve('/account')}>pouchbase.io</a>. The first version of a plugin makes its id
		yours; after that, only you can publish new versions of it.
	</p>

	<p>
		First check the plugin and build its bundle. <Code.Root>validate</Code.Root> also loads the server
		code and checks it against the manifest: every sign-in provider needs a handler, every handler a contribution,
		and route keys look like <Code.Root>GET /path</Code.Root>.
	</p>

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
			the bundle isn't valid, has an unknown category or is for an API version it doesn't know (<Code.Root
				>422</Code.Root
			>);
		</li>
		<li>the plugin id belongs to another account (<Code.Root>403</Code.Root>);</li>
		<li>
			that version is already published (<Code.Root>409</Code.Root>): published versions never
			change, so bump <Code.Root>version</Code.Root> in <Code.Root>package.json</Code.Root> (or the
			manifest) for every release.
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
		<Code.Root>PLUGIN_REGISTRY_URL</Code.Root> server variable is set. Browse what's published on the
		<a href={resolve('/plugins')}>plugins page</a>.
	</p>

	<ul>
		<li>
			A plugin with server code is deployed as a Worker named
			<Code.Root>&lt;instance&gt;-plugin-&lt;id&gt;</Code.Root> on the Cloudflare account of the installation,
			like <a href={resolve('/docs/functions')}>functions</a>. The account needs a
			<Code.Root>workers.dev</Code.Root> subdomain, and Workers on your plan count toward its limits.
			Removing the plugin deletes the Worker.
		</li>
		<li>
			Installing a newer version replaces the code of the Worker and keeps the settings of its
			sign-in providers.
		</li>
		<li>
			Built-in plugins are marked <strong>Built in</strong> and can't be removed; leave their sign-in
			providers disabled when you don't use them. Installing a newer version of a built-in plugin from
			the registry replaces it, and removing that version brings the built-in one back.
		</li>
	</ul>

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
