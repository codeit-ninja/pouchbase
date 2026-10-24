<script lang="ts">
	import * as Code from '#lib/components/ui/code/index.js';
	import * as Table from '#lib/components/ui/table/index.js';

	// The environment variables of the Node server, which Docker and the single binary both run.
	const variables = [
		{
			name: 'CLOUDFLARE_ACCOUNT_ID',
			fallback: '–',
			description: 'Cloudflare account that holds the D1 databases and the R2 bucket'
		},
		{
			name: 'CLOUDFLARE_API_TOKEN',
			fallback: '–',
			description: 'API token with the permissions from Before you start'
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
			name: 'POUCHBASE_ADMIN_EMAIL',
			fallback: '–',
			description:
				'Email address of the first admin; with POUCHBASE_ADMIN_PASSWORD, Pouchbase installs itself on the first request, without the install page'
		},
		{
			name: 'POUCHBASE_ADMIN_PASSWORD',
			fallback: '–',
			description: 'Password of the first admin, at least 10 characters'
		},
		{
			name: 'PLUGIN_REGISTRY_URL',
			fallback: 'https://api.pouchbase.io',
			description:
				'Plugin registry the Plugins page searches and installs from, such as the local registry of pouchbase-plugin dev'
		},
		{
			name: 'POUCHBASE_LOG_TIMING',
			fallback: 'false',
			description: 'true logs the duration of every request and database round-trip'
		}
	];
</script>

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
