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
		{ id: 'make-a-template', title: 'Make a template' },
		{ id: 'variables', title: 'Variables' },
		{ id: 'api-keys', title: 'API keys' },
		{ id: 'send-a-template', title: 'Send a template' },
		{ id: 'built-in-emails', title: 'Built-in emails' }
	];
</script>

<DocsPage
	title="Email templates"
	description="Design emails with variables in the admin, and send them from your functions or back-end with one call."
	{sections}
>
	<h2 id="make-a-template">Make a template</h2>

	<p>
		Create templates in the admin, under <strong>System → Mail</strong>. A template has a name
		(lowercase letters, digits and dashes, which your code sends it by), a subject and a body. Make
		the body in one of two editors:
	</p>

	<ul>
		<li>
			The <strong>visual editor</strong>: write text with headings, sizes, colors, alignment, lists
			and links, and add blocks with <strong>Insert</strong>: buttons, images, sections with a
			background, two or three columns that stack on phones, spacers and dividers. Select a block to
			change it in the side panel (a button's link, size, colors and corners, an image's width and
			alignment, a section's background and padding), or move, duplicate and delete it. With
			nothing selected, the panel sets the whole email: colors, font, text size, width, padding,
			corners and logo. Everything is written as tables with inline styles, so the email looks the
			same in every mail client.
		</li>
		<li>
			<strong>HTML</strong>: the whole document in a code editor, for full control. A visual
			template can be turned into HTML at any time.
		</li>
	</ul>

	<p>
		The <strong>preview text</strong> is shown next to the subject in the inbox. The
		<strong>Preview</strong> tab fills in the <strong>sample data</strong>, a JSON object you edit
		on its own tab, on a desktop or phone width, and <strong>Send test</strong> sends the email as
		it is in the editor to you. Every
		email also gets a plain-text version, made from the HTML. Sending needs mail settings:
		Cloudflare Email Service or an SMTP server, under <strong>Settings</strong>.
	</p>

	<h2 id="variables">Variables</h2>

	<p>
		Subjects and bodies use variables in double braces. Values are HTML-escaped, so a value can't
		add markup to the email.
	</p>

	<CodeBlock.Root title="welcome">
		<CodeBlock.Source code={data.code.variables} />
	</CodeBlock.Root>

	<ul>
		<li>
			<Code.Root>{'{{ name }}'}</Code.Root>, <Code.Root>{'{{ trial.endsOn }}'}</Code.Root>: a value,
			or a field of an object.
		</li>
		<li>
			<Code.Root>{'{{ name | there }}'}</Code.Root>: with a fallback for a missing or empty value.
		</li>
		<li>
			<Code.Root>{'{{#if trial}} … {{else}} … {{/if}}'}</Code.Root>: shown when the value is truthy;
			an empty list counts as false.
		</li>
		<li>
			<Code.Root>{'{{#each items}} … {{else}} … {{/each}}'}</Code.Root>: repeated per item. Inside,
			<Code.Root>{'{{ this }}'}</Code.Root> is the item, names are its fields first and otherwise the
			outer variables, and <Code.Root>{'{{ @index }}'}</Code.Root> and
			<Code.Root>{'{{ @number }}'}</Code.Root> count from 0 and from 1.
		</li>
	</ul>

	<p>
		In the visual editor, put a block tag in a paragraph or list item of its own: it may span
		several paragraphs, or repeat the items of a list. A variable used outside <Code.Root
			>#if</Code.Root
		> and loops, without a fallback, is <strong>required</strong>; the editor lists the variables of
		the template and which are required.
	</p>

	<h2 id="api-keys">API keys</h2>

	<p>
		Only server-side code can send email, so sending needs an API key rather than a user's token:
	</p>

	<ul>
		<li>
			Every <a href={resolve('/docs/functions')}>function</a> has a key of its own in
			<Code.Root>env.POUCHBASE_API_KEY</Code.Root>, renewed on each deploy. Functions deployed
			before keys existed get one on their next deploy.
		</li>
		<li>
			For your own back-end, create a key under <strong>System → API keys</strong>. The key is shown
			once; Pouchbase only stores a hash of it.
		</li>
	</ul>

	<Callout.Root variant="warning">
		<Callout.Icon><Icon.Root icon="lucide:key-round" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Keep keys on the server</Callout.Title>
			<Callout.Description>
				Anyone with a key can send your templates to any address. Never put one in an app that runs
				in the browser.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>

	<h2 id="send-a-template">Send a template</h2>

	<p>
		With the <a href="{resolve('/docs/authentication')}#the-sdk">SDK</a>, pass the key as
		<Code.Root>apiKey</Code.Root> and call <Code.Root>pb.mail.send()</Code.Root>:
	</p>

	<CodeBlock.Root title="function.ts">
		<CodeBlock.Source code={data.code.fn} />
	</CodeBlock.Root>

	<p>Or call the API from anywhere else:</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.curl} />
	</CodeBlock.Root>

	<p>
		<Code.Root>to</Code.Root> is one address or a list of up to 50; every recipient gets an email of their
		own, with the same variables. The answer is <Code.Root>{'{ "sent": 1 }'}</Code.Root>. Without a
		required variable it is a <Code.Root>422</Code.Root>, with an issue per variable (the SDK throws
		a <Code.Root>PouchbaseError</Code.Root> with them in <Code.Root>issues</Code.Root>):
	</p>

	<CodeBlock.Root title="422">
		<CodeBlock.Source code={data.code.missing} />
	</CodeBlock.Root>

	<p>
		An invalid or missing key answers <Code.Root>401</Code.Root>, an unknown template
		<Code.Root>404</Code.Root>, and <Code.Root>503</Code.Root> when sending email isn't set up.
	</p>

	<h2 id="built-in-emails">Built-in emails</h2>

	<p>
		The emails Pouchbase sends itself, <Code.Root>verification</Code.Root> and
		<Code.Root>password-reset</Code.Root> (see
		<a href={resolve('/docs/authentication')}>Authentication</a>), are templates too, with the
		variables <Code.Root>{'{{ url }}'}</Code.Root> and
		<Code.Root>{'{{ email }}'}</Code.Root>. Change their text and style like any other template, or
		reset them to the original. They can't be deleted, and they can't be sent through the API, so
		nobody can send a sign-in link of their own choosing in your name.
	</p>
</DocsPage>
