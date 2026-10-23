<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { getApiKeys } from './api-keys.remote';
	import CreateApiKeyDialog from './create-api-key-dialog.svelte';
	import DeleteApiKeyDialog from './delete-api-key-dialog.svelte';

	const keys = $derived(await getApiKeys());

	const dialogs = Dialog.getDialogs();

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head>
	<title>API keys · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>API keys</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>API keys</Page.Title>
				<Page.Description>
					Secret keys for server-side code, such as your back-end, to send email templates through
					the API. Keys with the service scope also use the records API as an admin. Every function
					has a key of its own in <code>env.POUCHBASE_API_KEY</code>, renewed on each deploy.
				</Page.Description>
			</div>

			{#if keys.length}
				<Button.Root onclick={() => void dialogs.open(CreateApiKeyDialog)}>
					<Icon.Root icon="lucide:plus" />
					New API key
				</Button.Root>
			{/if}
		</Page.Header>

		{#if keys.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Key</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head>Last used</Table.Head>
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each keys as apiKey (apiKey.id)}
						<Table.Row>
							<Table.Cell>
								<span class="flex items-center gap-2 font-medium text-zinc-900">
									{apiKey.name}
									{#if apiKey.functionName}
										<Badge.Root variant="outline">Function</Badge.Root>
									{/if}
									{#if apiKey.scope === 'service'}
										<Badge.Root variant="outline">Service</Badge.Root>
									{/if}
								</span>
							</Table.Cell>
							<Table.Cell class="font-mono text-xs whitespace-nowrap">{apiKey.prefix}…</Table.Cell>
							<Table.Cell class="whitespace-nowrap"
								>{dateFormat.format(apiKey.createdAt)}</Table.Cell
							>
							<Table.Cell class="whitespace-nowrap">
								{apiKey.lastUsedAt ? dateFormat.format(apiKey.lastUsedAt) : 'Never'}
							</Table.Cell>
							<Table.Cell class="w-0 text-right">
								{#if !apiKey.functionName}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger variant="ghost" size="icon" aria-label="Key actions">
											<Icon.Root icon="lucide:ellipsis" />
										</DropdownMenu.Trigger>

										<DropdownMenu.Content>
											<DropdownMenu.Item
												variant="danger"
												onSelect={() => void dialogs.open(DeleteApiKeyDialog, { apiKey })}
											>
												<Icon.Root icon="lucide:trash-2" />
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root>
				<Empty.Icon><Icon.Root icon="lucide:key-round" /></Empty.Icon>
				<Empty.Title>No API keys yet</Empty.Title>
				<Empty.Description>
					Create a key for your back-end to send email with <code>POST /api/mail/send</code>.
					Functions get a key of their own when they are deployed.
				</Empty.Description>
				<Button.Root onclick={() => void dialogs.open(CreateApiKeyDialog)}>
					<Icon.Root icon="lucide:plus" />
					New API key
				</Button.Root>
			</Empty.Root>
		{/if}
	</div>
</Page.Root>
