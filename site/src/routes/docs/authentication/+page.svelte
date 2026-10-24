<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import DocsPage, { type Section } from '../docs-page.svelte';

	let { data }: PageProps = $props();

	const sections: Section[] = [
		{ id: 'the-sdk', title: 'The SDK' },
		{ id: 'app-users', title: 'App users' },
		{ id: 'sign-in-methods', title: 'Sign-in methods' },
		{ id: 'password', title: 'Email and password' },
		{ id: 'oauth', title: 'OAuth' },
		{ id: 'mail', title: 'Verification and password reset' },
		{ id: 'tokens', title: 'Tokens' },
		{ id: 'rest-api', title: 'REST API' }
	];

	const endpoints = [
		['GET /api/auth/providers', 'The active OAuth providers'],
		[
			'POST /api/auth/password/sign-up',
			'{ name, email, password } → { token, user_id, verification_required }; 400 or 409 with issues per field'
		],
		[
			'POST /api/auth/password/sign-in',
			'{ email, password }; 401 for wrong credentials, 403 (email_not_verified) until the email is verified'
		],
		['POST /api/auth/password/request-reset', '{ email }; the same answer for unknown addresses'],
		[
			'POST /api/auth/password/confirm-reset',
			'{ token, password }; 400 for an invalid or expired link'
		],
		['POST /api/auth/verification/request', '{ email }'],
		['POST /api/auth/verification/confirm', '{ token }; marks the user as verified'],
		[
			'GET /api/auth/oauth2/<provider>',
			'?state=…&challenge=…, opened in a popup; starts an OAuth sign-in'
		],
		[
			'POST /api/auth/oauth2/result',
			'{ state, verifier }: 202 while pending, then the result once'
		],
		['GET /api/auth/me', 'The signed-in user, or 401']
	];
</script>

<DocsPage
	title="Authentication"
	description="Sign the users of your app in with an email and password or with OAuth, and send their token along with every request."
	{sections}
>
	<h2 id="the-sdk">The SDK</h2>

	<p>
		The examples on these pages use <Code.Root>@pouchbasejs/js-sdk</Code.Root>, the TypeScript
		client for the Pouchbase API. It has no dependencies and runs wherever <Code.Root
			>fetch</Code.Root
		> exists: browsers, Node 20 or later, Deno, Bun and Cloudflare Workers.
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Line>pnpm add @pouchbasejs/js-sdk</CodeBlock.Line>
	</CodeBlock.Root>

	<CodeBlock.Root title="src/pouchbase-client.ts">
		<CodeBlock.Source code={data.code.client} />
	</CodeBlock.Root>

	<p>
		Every failed request throws a <Code.Root>PouchbaseError</Code.Root> with a <Code.Root
			>kind</Code.Root
		>
		(<Code.Root>network</Code.Root>, <Code.Root>invalid</Code.Root>,
		<Code.Root>unauthorized</Code.Root>, <Code.Root>forbidden</Code.Root>,
		<Code.Root>not_found</Code.Root>, <Code.Root>conflict</Code.Root>, <Code.Root>server</Code.Root>
		or <Code.Root>unknown</Code.Root>), the HTTP <Code.Root>status</Code.Root>, a
		<Code.Root>message</Code.Root> and, for validation errors, <Code.Root>issues</Code.Root> per field.
		<Code.Root>isPouchbaseError(error, kind?)</Code.Root> checks for one.
	</p>

	<h2 id="app-users">App users</h2>

	<p>
		Every installation has a built-in <Code.Root>users</Code.Root> collection for the users of your app,
		separate from the admins who sign in to the Pouchbase admin. It has the fields
		<Code.Root>email</Code.Root> (unique), <Code.Root>name</Code.Root> (the full name),
		<Code.Root>avatar</Code.Root> (a relation to
		<Code.Root>files</Code.Root>) and <Code.Root>verified</Code.Root>, which can't be renamed or
		deleted; you can add fields of your own. Password hashes are kept in an internal table, never in
		<Code.Root>users</Code.Root>.
	</p>

	<p>
		Users can't be created through the records API: they sign up. Through the records API they can't
		change their <Code.Root>email</Code.Root> or <Code.Root>verified</Code.Root> either. Who may read
		and change the other fields is up to the
		<a href="{resolve('/docs/collections')}#api-rules">API rules</a> of
		<Code.Root>users</Code.Root>.
	</p>

	<h2 id="sign-in-methods">Sign-in methods</h2>

	<p>
		Turn the sign-in methods on in the admin, on the <strong>Authentication</strong> page (System in the
		sidebar):
	</p>

	<ul>
		<li>
			<strong>Email and password</strong>, optionally with sign-up by the users themselves and
			<strong>Require a verified email</strong>, so accounts are only active once their address is
			verified. Admins set a user's password in the <Code.Root>users</Code.Root> collection.
		</li>
		<li>
			<strong>OAuth</strong> with Google, GitHub, Microsoft, Discord and Twitch. Create an OAuth app at
			the provider, register the callback URL that the setup dialog shows, then enter the client ID and
			secret.
		</li>
	</ul>

	<h2 id="password">Email and password</h2>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.password} />
	</CodeBlock.Root>

	<p>
		A sign-up fails with <Code.Root>invalid</Code.Root> (400) or <Code.Root>conflict</Code.Root> (409,
		for an email that is taken), with a message per field in <Code.Root>issues</Code.Root>. With
		mail set up, every sign-up sends a verification email. When a verified email is required, a
		sign-up returns no token (<Code.Root>verificationRequired</Code.Root> is <Code.Root
			>true</Code.Root
		>), and signing in fails with <Code.Root>forbidden</Code.Root> (403) and the code
		<Code.Root>email_not_verified</Code.Root> until the user followed the link.
	</p>

	<h2 id="oauth">OAuth</h2>

	<p>
		Call <Code.Root>signInWithOAuth</Code.Root> straight from a click handler: browsers only allow the
		popup then.
	</p>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.oauth} />
	</CodeBlock.Root>

	<p>
		The token never appears in a URL. The SDK starts the sign-in with the hash of a secret verifier
		(PKCE), and only a caller with that verifier can collect the result, by polling
		<Code.Root>POST /api/auth/oauth2/result</Code.Root>. Outside the browser, pass
		<Code.Root>open: (url) =&gt; …</Code.Root> to open the sign-in page another way.
	</p>

	<p>
		A sign-in is linked to an existing user with the same email only when the provider verified that
		email: Google, the verified emails of GitHub and Discord do; Microsoft and Twitch don't. So
		nobody can take over an account by claiming its address. On a sign-up through OAuth, the
		provider's profile picture becomes the user's avatar.
	</p>

	<h2 id="mail">Verification and password reset</h2>

	<p>
		Verification and password reset emails need mail settings, under <strong>Mail → Sending</strong>
		in the admin, which has a button to test them:
	</p>

	<ul>
		<li>
			<strong>Cloudflare Email Service</strong> uses the instance's own API token, which then also needs
			Email Sending (Edit). Onboard the sender's domain under Email Service → Email Sending first.
		</li>
		<li>
			<strong>An SMTP server</strong> of any provider, with TLS (port 465), STARTTLS (587) or no encryption.
			Workers can't connect to port 25.
		</li>
	</ul>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.mail} />
	</CodeBlock.Root>

	<p>
		The links in the emails open pages of Pouchbase itself (<Code.Root
			>/account/verify-email</Code.Root
		>
		and <Code.Root>/account/reset-password</Code.Root>). Reset links are valid for 30 minutes and
		work once; verification links are valid for 3 days.
	</p>

	<h2 id="tokens">Tokens</h2>

	<p>
		Every sign-in returns <Code.Root>{'{ token, user_id }'}</Code.Root>. The token is a JWT (HS256),
		valid for 7 days. The SDK keeps it in <Code.Root>pb.authStore</Code.Root> and sends it as
		<Code.Root>Authorization: Bearer &lt;token&gt;</Code.Root>; without the SDK, send that header
		yourself. The API answers requests from any origin.
	</p>

	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:shield-check" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>What a user may do is up to the API rules</Callout.Title>
			<Callout.Description>
				Signing in only proves who the user is. Every collection decides per action who may list,
				view, create, update and delete its records; see
				<a
					href="{resolve('/docs/collections')}#api-rules"
					class="font-medium underline underline-offset-2">API rules</a
				>.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>

	<h2 id="rest-api">REST API</h2>

	<p>What the SDK calls, for other languages and clients:</p>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Request</Table.Head>
				<Table.Head>Purpose</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each endpoints as [request, purpose] (request)}
				<Table.Row>
					<Table.Cell><Code.Root class="whitespace-nowrap">{request}</Code.Root></Table.Cell>
					<Table.Cell>{purpose}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</DocsPage>
