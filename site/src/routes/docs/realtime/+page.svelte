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
		{ id: 'subscribe', title: 'Subscribe' },
		{ id: 'what-you-receive', title: 'What you receive' },
		{ id: 'the-connection', title: 'The connection' },
		{ id: 'protocol', title: 'The protocol' },
		{ id: 'hosting', title: 'Hosting' }
	];

	const messages = [
		['auth', 'Client', '{ token? } — the first message, within 10 seconds'],
		['ready', 'Server', '{ subject, expiresAt } — authenticated; subscribe now'],
		[
			'subscribe',
			'Client',
			'{ id, record?, filter?, fields? } — every record, or the one with id record'
		],
		['subscribed', 'Server', '{ id } — or error with the same id'],
		['unsubscribe', 'Client', '{ id }'],
		['event', 'Server', '{ id, action, record, at } — at is when the change was saved, in ms'],
		['error', 'Server', '{ id?, code, message }'],
		['ping / pong', 'Both', 'The heartbeat: send {"type":"ping"} every 30 seconds']
	];

	const closeCodes = [
		['1001', 'A deploy or restart; reconnect'],
		['4000', 'Too many invalid messages in a row'],
		['4001', 'No auth message within 10 seconds'],
		['4004', 'The collection query parameter is missing or invalid'],
		['4401', 'The token is invalid, or expired while connected']
	];
</script>

<DocsPage
	title="Realtime"
	description="Follow the records of a collection as they change: every create, update and delete that the collection's view rule lets the user see, over a WebSocket."
	{sections}
>
	<h2 id="subscribe">Subscribe</h2>

	<p>
		With the <a href="{resolve('/docs/authentication')}#the-sdk">SDK</a>, subscribe on the
		collection.
		<Code.Root>where</Code.Root> and <Code.Root>select</Code.Root> work as in
		<a href="{resolve('/docs/collections')}#reading-records">findMany</a>, and
		<Code.Root>include</Code.Root> as in
		<a href="{resolve('/docs/collections')}#relations">relations</a>:
	</p>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.subscribe} />
	</CodeBlock.Root>

	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:shield-check" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>The view rule decides</Callout.Title>
			<Callout.Description>
				A subscription needs a view rule other than Admins only, and only sends the records that
				rule lets the user see; see
				<a
					href="{resolve('/docs/collections')}#api-rules"
					class="font-medium underline underline-offset-2">API rules</a
				>.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>

	<h2 id="what-you-receive">What you receive</h2>

	<ul>
		<li>
			An event's record has the same shape as the records API returns it. For a delete, it is the
			record as it was.
		</li>
		<li>
			A record that no longer matches the view rule or your filter after an update sends no event.
		</li>
		<li>
			The rule sees the signed-in user as they were when the connection was made, and is checked
			again on every reconnect.
		</li>
		<li>Changes made outside the records layer, such as restoring a backup, send no events.</li>
	</ul>

	<h2 id="the-connection">The connection</h2>

	<p>
		The SDK opens one WebSocket per collection, with the first subscription, and closes it after the
		last one. It reconnects by itself, and when <Code.Root>pb.authStore</Code.Root> changes it reconnects
		as the new user. The server closes the connection when the token expires.
	</p>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.state} />
	</CodeBlock.Root>

	<p>
		The SDK uses <Code.Root>globalThis.WebSocket</Code.Root>, which browsers, Node 22 or later,
		Deno, Bun and Workers have. Elsewhere, pass one to the client:
		<Code.Root>createClient(url, {'{ webSocket: WebSocket }'})</Code.Root>, for example from the
		<Code.Root>ws</Code.Root> package.
	</p>

	<h2 id="protocol">The protocol</h2>

	<p>
		Clients in other languages connect to <Code.Root
			>/api/realtime?collection=&lt;name&gt;</Code.Root
		>, authenticate, and then subscribe. Every message is JSON with a <Code.Root>type</Code.Root>:
	</p>

	<CodeBlock.Root title="JavaScript">
		<CodeBlock.Source code={data.code.protocol} />
	</CodeBlock.Root>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Type</Table.Head>
				<Table.Head>From</Table.Head>
				<Table.Head>Contents</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each messages as [type, from, contents] (type)}
				<Table.Row>
					<Table.Cell><Code.Root class="whitespace-nowrap">{type}</Code.Root></Table.Cell>
					<Table.Cell>{from}</Table.Cell>
					<Table.Cell>{contents}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<p>
		Error codes are <Code.Root>invalid_message</Code.Root>, <Code.Root>not_authenticated</Code.Root
		>,
		<Code.Root>collection_not_found</Code.Root>, <Code.Root>forbidden</Code.Root>,
		<Code.Root>invalid_filter</Code.Root>, <Code.Root>too_many_subscriptions</Code.Root> (at most 100
		per connection), <Code.Root>duplicate_id</Code.Root> and <Code.Root>server_error</Code.Root>.
		Messages are at most 32 KB. The server closes the connection with these codes:
	</p>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Code</Table.Head>
				<Table.Head>Meaning</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each closeCodes as [code, meaning] (code)}
				<Table.Row>
					<Table.Cell><Code.Root>{code}</Code.Root></Table.Cell>
					<Table.Cell>{meaning}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<h2 id="hosting">Hosting</h2>

	<p>
		On Cloudflare Workers, every collection with subscribers has a Durable Object that holds its
		sockets. It is SQLite-backed, so the Free plan works too, and it hibernates while no events come
		in, so open sockets aren't billed for duration. On Docker and the single binary, the server
		holds the sockets itself.
	</p>

	<p>
		Behind a reverse proxy, let WebSocket upgrades through. Caddy does this by default; nginx needs
		<Code.Root>proxy_set_header Upgrade $http_upgrade</Code.Root> and
		<Code.Root>proxy_set_header Connection "upgrade"</Code.Root>.
	</p>
</DocsPage>
