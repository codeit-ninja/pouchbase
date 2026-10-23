<script lang="ts">
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import DocsPage, { type Section } from '../docs-page.svelte';

	let { data }: PageProps = $props();

	const sections: Section[] = [
		{ id: 'collections', title: 'Collections' },
		{ id: 'types', title: 'Types' },
		{ id: 'reading-records', title: 'Reading records' },
		{ id: 'relations', title: 'Relations' },
		{ id: 'writing-records', title: 'Writing records' },
		{ id: 'api-rules', title: 'API rules' },
		{ id: 'filters', title: 'Filters' },
		{ id: 'files', title: 'Files' },
		{ id: 'schema', title: 'Managing collections' },
		{ id: 'rest-api', title: 'REST API' }
	];

	const rules = [
		['Admins only', 'The default: not available through the API, only to admins in the dashboard.'],
		['Everyone', 'Also without signing in.'],
		['Signed-in users', 'Any request with a valid token (@request.auth.id != "").'],
		[
			'Owner',
			'Only the user in a relation field to users, such as author = @request.auth.id. In users itself: the user themselves.'
		],
		[
			'Custom rule',
			'A filter; only records that match it are allowed, e.g. status = "published" || author = @request.auth.id.'
		]
	];

	const operators = [
		['=  !=', 'Equal, not equal'],
		['>  >=  <  <=', 'Greater and less than'],
		['~  !~', 'Contains, does not contain (text)'],
		['?=  ?~  …', 'With ? in front: any item of a multiple relation or list, e.g. tags ?= "news"'],
		['&&  ||  ( )', 'And, or, grouping']
	];

	const endpoints = [
		[
			'GET /api/collections/<name>/records',
			'Records the list rule allows; page, perPage, sort, filter, fields, expand'
		],
		['GET /api/collections/<name>/records/<id>', 'One record, when the view rule allows it'],
		[
			'POST /api/collections/<name>/records',
			'Creates a record from { <field>: value }, when the create rule allows it'
		],
		[
			'PATCH /api/collections/<name>/records/<id>',
			'Changes the given fields, when the update rule allows it'
		],
		[
			'DELETE /api/collections/<name>/records/<id>',
			'Deletes a record when the delete rule allows it; 204'
		],
		['GET /api/files/<id>', 'A file from the files collection; ?thumb=<size>, ?download'],
		['GET /api/types?token=…', 'TypeScript types of every collection; the URL is on the Types page']
	];

	const schemaEndpoints = [
		['GET /api/collections', 'Every collection with its fields, indexes, API rules and settings'],
		['GET /api/collections/<name>', 'One collection'],
		['POST /api/collections', 'Creates a collection from { name, fields, indexes, rules }; 201'],
		[
			'PATCH /api/collections/<name>',
			'Changes the given parts; ?force=true for changes that remove fields or data'
		],
		['DELETE /api/collections/<name>', 'Deletes a collection and its records; 204'],
		['GET /api/collections/export', 'An export file; ?collections=a,b for some of them'],
		['POST /api/collections/import', 'Imports an export file; ?dryRun, ?removeMissing, ?force']
	];
</script>

<DocsPage
	title="Collections and records"
	description="Model your data in collections, then read and write their records from your app, guarded by an API rule per action."
	{sections}
>
	<h2 id="collections">Collections</h2>

	<p>
		A collection is a table in the app database of your instance, with fields you define in the
		admin: text and rich text, numbers, booleans, dates, emails, URLs, JSON, lists, relations to
		other collections, files and computed fields. Every installation has two built-in collections: <Code.Root
			>users</Code.Root
		>, for the users of your app (see <a href={resolve('/docs/authentication')}>Authentication</a>),
		and
		<Code.Root>files</Code.Root>, for uploads.
	</p>

	<p>
		Collections get an id field and timestamp fields only when you add them: an <strong>ID</strong>
		field with the generator of your choice (auto-increment, UUID v4 or v7, or a random string), and
		<strong>Created</strong> and <strong>Updated</strong> fields. The <strong>API</strong> button of
		a collection sets its <a href="#api-rules">API rules</a> and shows every call below for its own fields,
		with SDK and cURL examples.
	</p>

	<h2 id="types">Types</h2>

	<p>
		The <strong>Types</strong> page of the admin has TypeScript types for your collections and a URL
		to download them. Write them to a file, for example in a <Code.Root>postinstall</Code.Root> script
		or a CI job, and pass the <Code.Root>Schema</Code.Root> to the client (see
		<a href="{resolve('/docs/authentication')}#the-sdk">The SDK</a>):
	</p>

	<CodeBlock.Root title="Terminal">
		<CodeBlock.Source code={data.code.types} />
	</CodeBlock.Root>

	<p>
		The file has a <Code.Root>&lt;Name&gt;Record</Code.Root> (what the API returns) and a
		<Code.Root>&lt;Name&gt;Create</Code.Root> (what you send) per collection. Every collection is then
		a typed property of <Code.Root>pb.db</Code.Root>: field names, conditions, the sort order, the
		selected fields, the values you send and the results are all checked. Collections that aren't in
		the schema are reached with <Code.Root>pb.db.$collection('name')</Code.Root>.
	</p>

	<h2 id="reading-records">Reading records</h2>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.read} />
	</CodeBlock.Root>

	<p>
		Conditions are objects, so values never need escaping. Records come back with real values:
		booleans as booleans, JSON fields parsed, and multiple relations, files and lists as arrays
		(empty when there are none). Blob fields are left out.
	</p>

	<h2 id="relations">Relations</h2>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.relations} />
	</CodeBlock.Root>

	<p>
		Relation and file fields hold ids. <Code.Root>include</Code.Root> returns the related records instead,
		typed from the collection they point to, on every read and on
		<Code.Root>insert()</Code.Root> and <Code.Root>patch()</Code.Root>, up to three levels deep. A
		single relation becomes a record or <Code.Root>null</Code.Root>, a multiple one an array.
		Related records that the view rule of their collection hides are left out, and including a
		collection whose view rule is Admins only fails with a 400.
	</p>

	<h2 id="writing-records">Writing records</h2>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.write} />
	</CodeBlock.Root>

	<p>
		<Code.Root>insert()</Code.Root> takes the generated <Code.Root>&lt;Name&gt;Create</Code.Root>
		type: fields Pouchbase fills in itself (ids, timestamps, computed fields) are left out, and required
		fields are required. <Code.Root>files</Code.Root> records can only be listed, viewed and deleted through
		the API.
	</p>

	<h2 id="api-rules">API rules</h2>

	<p>
		Every collection has an API rule per action: list and search, view, create, update and delete.
		Set them with the <strong>API</strong> button of the collection, under Access rules. Each rule is
		one of:
	</p>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Rule</Table.Head>
				<Table.Head>Who may</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rules as [rule, meaning] (rule)}
				<Table.Row>
					<Table.Cell class="font-medium whitespace-nowrap text-zinc-900">{rule}</Table.Cell>
					<Table.Cell>{meaning}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<p>
		The list rule filters the results, and the create rule is checked against the new record. A call
		that a rule locks fails with <Code.Root>forbidden</Code.Root>. Records a rule doesn't match are
		left out of lists and are "not found" otherwise: <Code.Root>null</Code.Root> from
		<Code.Root>find()</Code.Root>, <Code.Root>not_found</Code.Root> from <Code.Root
			>patch()</Code.Root
		>
		and <Code.Root>remove()</Code.Root>. The rule editor suggests fields as you type and underlines
		mistakes.
	</p>

	<p>
		Server-side code that has to manage every record, such as a back-end that writes what users may
		not, uses an API key with the <strong>service</strong> scope (<strong>System → API keys</strong
		>). The rules don't apply to it, as for an admin. Pass the key as
		<Code.Root>apiKey</Code.Root> and call the records through <Code.Root>pb.asService()</Code.Root
		>:
		<Code.Root>pb.asService().db.posts.patch(id, &#123; featured: true &#125;)</Code.Root>. Never
		put a service key in an app that runs in the browser.
	</p>

	<h2 id="filters">Filters</h2>

	<p>
		Custom rules and hand-written filters use the same syntax: field names, <Code.Root
			>"strings"</Code.Root
		>, numbers, <Code.Root>true</Code.Root> and <Code.Root>false</Code.Root>, <Code.Root
			>null</Code.Root
		>,
		<Code.Root>@now</Code.Root>, <Code.Root>@request.auth.&lt;field&gt;</Code.Root> (the signed-in user;
		an empty string when signed out) and <Code.Root>@request.body.&lt;field&gt;</Code.Root> (the submitted
		values), with these operators:
	</p>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Operator</Table.Head>
				<Table.Head>Meaning</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each operators as [operator, meaning] (operator)}
				<Table.Row>
					<Table.Cell><Code.Root class="whitespace-pre">{operator}</Code.Root></Table.Cell>
					<Table.Cell>{meaning}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<p>
		For what <Code.Root>where</Code.Root> can't express, such as the signed-in user, write the filter
		yourself:
	</p>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.handWritten} />
	</CodeBlock.Root>

	<h2 id="files">Files</h2>

	<p>
		Uploads are records of the built-in <Code.Root>files</Code.Root> collection, stored in R2 or in an
		S3-compatible bucket of your choice. A <strong>File</strong> field links them to a record; it can
		limit the file types and set a maximum size of up to 10 MB. Files are public by their random id:
	</p>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.files} />
	</CodeBlock.Root>

	<p>
		Thumbnails are made for the sizes listed in the settings of <Code.Root>files</Code.Root>, in
		PocketBase syntax: <Code.Root>100x100</Code.Root> crops from the center,
		<Code.Root>100x100t</Code.Root> and <Code.Root>100x100b</Code.Root> from the top and bottom,
		<Code.Root>100x100f</Code.Root> fits without cropping, and <Code.Root>100x0</Code.Root> or
		<Code.Root>0x100</Code.Root> scale to one side. Only PNG, JPEG, GIF, WebP and AVIF images are shown
		inline; every other type is downloaded.
	</p>

	<h2 id="schema">Managing collections</h2>

	<p>
		Collections can also be managed from code, for example in a deploy script, with an API key with
		the <strong>service</strong> scope. <Code.Root>pb.collections</Code.Root> creates, changes and
		deletes collections with their fields, indexes and API rules, and exports and imports them as a
		JSON file without records. The same export and import are in the menu next to
		<strong>Collections</strong> in the admin.
	</p>

	<CodeBlock.Root title="TypeScript">
		<CodeBlock.Source code={data.code.schema} />
	</CodeBlock.Root>

	<p>
		An import creates the collections of the file and changes existing ones to match it; other
		collections stay unless you pass <Code.Root>removeMissing: true</Code.Root>. Relations to
		collections outside the file are found by name. Changes that remove fields or data fail with
		409 unless you pass <Code.Root>force: true</Code.Root>; <Code.Root>dryRun: true</Code.Root> only
		returns the plan.
	</p>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Request</Table.Head>
				<Table.Head>Purpose</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each schemaEndpoints as [request, purpose] (request)}
				<Table.Row>
					<Table.Cell><Code.Root class="whitespace-nowrap">{request}</Code.Root></Table.Cell>
					<Table.Cell>{purpose}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	<h2 id="rest-api">REST API</h2>

	<p>
		What the SDK calls, for other languages and clients. Send the token of a signed-in user as
		<Code.Root>Authorization: Bearer &lt;token&gt;</Code.Root>.
	</p>

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

	<p>
		A list takes <Code.Root>page</Code.Root> (default 1), <Code.Root>perPage</Code.Root> (default 30,
		at most 500), <Code.Root>sort</Code.Root> (<Code.Root>-created_at,title</Code.Root>; a minus
		sorts descending), <Code.Root>filter</Code.Root>, <Code.Root>fields</Code.Root>
		(<Code.Root>id,title</Code.Root>) and <Code.Root>expand</Code.Root>
		(<Code.Root>author,comments.author</Code.Root>, which every call but a delete takes), and
		answers
		<Code.Root>{'{ page, perPage, totalItems, totalPages, items }'}</Code.Root>. Validation errors
		are a 400 with a message per field in <Code.Root>issues</Code.Root>.
	</p>
</DocsPage>
