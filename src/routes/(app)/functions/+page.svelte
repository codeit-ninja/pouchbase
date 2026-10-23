<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Link from '#lib/components/ui/link/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import CreateFunctionDialog from './create-function-dialog.svelte';
	import { getFunctions } from './functions.remote';

	const functions = $derived(await getFunctions());

	const dialogs = Dialog.getDialogs();

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head>
	<title>Functions · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Functions</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Functions</Page.Title>
				<Page.Description>
					Server-side code for your app, such as webhooks or calls to other APIs with secret keys.
					Every function runs as a Worker of its own on your Cloudflare account.
				</Page.Description>
			</div>

			{#if functions.length}
				<Button.Root onclick={() => void dialogs.open(CreateFunctionDialog)}>
					<Icon.Root icon="lucide:plus" />
					New function
				</Button.Root>
			{/if}
		</Page.Header>

		{#if functions.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Version</Table.Head>
						<Table.Head>Access</Table.Head>
						<Table.Head>Updated</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each functions as fn (fn.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex min-w-0 flex-col">
									<Link.Root
										href={resolve('/(app)/functions/[name]', { name: fn.name })}
										class="font-medium"
									>
										{fn.name}
									</Link.Root>
									{#if fn.description}
										<span class="truncate text-xs text-zinc-500">{fn.description}</span>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell>
								{#if fn.deployed}
									<span class="flex items-center gap-2 tabular-nums">
										v{fn.version}
										<Badge.Root variant="outline">
											{fn.language === 'typescript' ? 'TypeScript' : 'JavaScript'}
										</Badge.Root>
									</span>
								{:else}
									<Badge.Root>Not deployed</Badge.Root>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{fn.requireAuth ? 'Signed-in users' : 'Anyone'}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">{dateFormat.format(fn.updatedAt)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root>
				<Empty.Icon><Icon.Root icon="lucide:square-function" /></Empty.Icon>
				<Empty.Title>No functions yet</Empty.Title>
				<Empty.Description>
					Write a function here or upload a file. Apps call it with
					<code>/api/functions/&lt;name&gt;</code>.
				</Empty.Description>
				<Button.Root onclick={() => void dialogs.open(CreateFunctionDialog)}>
					<Icon.Root icon="lucide:plus" />
					New function
				</Button.Root>
			</Empty.Root>
		{/if}
	</div>
</Page.Root>
