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
		{ id: 'write-a-function', title: 'Write a function' },
		{ id: 'the-signed-in-user', title: 'The signed-in user' },
		{ id: 'secrets', title: 'Secrets and variables' },
		{ id: 'call-a-function', title: 'Call a function' },
		{ id: 'versions-logs-and-tests', title: 'Versions, logs and tests' },
		{ id: 'how-it-runs', title: 'How it runs' }
	];
</script>

<DocsPage
	title="Functions"
	description="Run your own server-side code next to Pouchbase: a function is a Cloudflare Worker that Pouchbase deploys for you and calls with the signed-in user."
	{sections}
>
	<h2 id="write-a-function">Write a function</h2>

	<p>
		Create functions in the admin, under <strong>System → Functions</strong>. A function is one ES
		module whose default export has a <Code.Root>fetch(request, env, ctx)</Code.Root> handler, the same
		as a Cloudflare Worker. Write it in TypeScript or JavaScript in the editor, or upload a
		<Code.Root>.ts</Code.Root> or <Code.Root>.js</Code.Root> file; TypeScript is compiled in the browser.
		A new function starts with this code:
	</p>

	<CodeBlock.Root title="function.ts">
		<CodeBlock.Source code={data.code.handler} />
	</CodeBlock.Root>

	<p>
		Function names are lowercase letters, digits and dashes, at most 40 characters. The code can be
		up to 1 MB. To use npm packages, bundle them into one file first and upload that:
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.bundle} />
	</CodeBlock.Root>

	<h2 id="the-signed-in-user">The signed-in user</h2>

	<p>
		Pouchbase checks the token of the app user who calls the function before the request reaches it.
		<Code.Root>pouchbaseUser(request)</Code.Root> returns that user, as
		<Code.Root>GET /api/auth/me</Code.Root> does, or <Code.Root>null</Code.Root> when the request has
		no valid token. A function set to require sign-in answers <Code.Root>401</Code.Root> to requests without
		a valid token, so its code never runs for them.
	</p>

	<h2 id="secrets">Secrets and variables</h2>

	<p>
		Set secrets on the <strong>Secrets</strong> tab of a function: API keys, webhook secrets and the
		like. Cloudflare stores them encrypted on the function's Worker, and the code reads them from
		<Code.Root>env</Code.Root>. Names are upper-case letters, digits and underscores.
		<Code.Root>env.POUCHBASE_URL</Code.Root> is set by Pouchbase: the URL of the installation, for calling
		its API from the function. So is <Code.Root>env.POUCHBASE_API_KEY</Code.Root>, an API key of the
		function that is renewed on every deploy, for example to
		<a href={resolve('/docs/email')}>send email templates</a>.
	</p>

	<h2 id="call-a-function">Call a function</h2>

	<p>
		Apps call a function at <Code.Root>/api/functions/&lt;name&gt;</Code.Root>. The method, headers,
		body, and the rest of the path and query string are passed on, so one function can serve a whole
		small API. With the <a href="{resolve('/docs/authentication')}#the-sdk">SDK</a>:
	</p>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.invoke} />
	</CodeBlock.Root>

	<p>
		The SDK parses a JSON answer, or returns text otherwise, and throws a
		<Code.Root>PouchbaseError</Code.Root> for an answer that isn't 2xx. Without the SDK, send the user's
		token yourself:
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.curl} />
	</CodeBlock.Root>

	<p>
		A function that doesn't exist answers <Code.Root>404</Code.Root>. Calls from servers, such as
		webhooks, and JSON requests from browsers work. Browsers on other sites can't post HTML forms to
		a function.
	</p>

	<h2 id="versions-logs-and-tests">Versions, logs and tests</h2>

	<ul>
		<li>Every deploy is kept as a version, and an earlier version can be restored.</li>
		<li>
			The <strong>Test</strong> tab sends requests to the deployed version, without a signed-in
			user:
			<Code.Root>pouchbaseUser(request)</Code.Root> returns <Code.Root>null</Code.Root> there.
		</li>
		<li>
			The <strong>Logs</strong> tab shows what the function logged, from Workers Logs. The API token of
			the instance needs Workers Observability (Edit) for this.
		</li>
	</ul>

	<h2 id="how-it-runs">How it runs</h2>

	<p>
		Every deploy uploads the code as a Worker of its own on the same Cloudflare account, named
		<Code.Root>&lt;instance&gt;-fn-&lt;name&gt;</Code.Root> (<Code.Root
			>pouchbase-fn-hello</Code.Root
		>
		by default). So functions run on Cloudflare whichever way you host Pouchbase itself, and follow the
		limits and pricing of your Workers plan.
	</p>

	<p>
		The Worker answers on its <Code.Root>workers.dev</Code.Root> URL, but only to requests that carry
		the function's secret, which only Pouchbase knows: apps always go through
		<Code.Root>/api/functions</Code.Root>. The account needs a <Code.Root>workers.dev</Code.Root>
		subdomain; open Workers &amp; Pages in the Cloudflare dashboard once to get one.
	</p>

	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:shield" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>HTML from a function can't run scripts</Callout.Title>
			<Callout.Description>
				Answers are served from the domain of your Pouchbase admin, so they get
				<Code.Root>Content-Security-Policy: sandbox</Code.Root>. Serve pages with scripts from your
				own app instead.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>
</DocsPage>
