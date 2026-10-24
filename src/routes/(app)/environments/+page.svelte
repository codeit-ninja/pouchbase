<script lang="ts">
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import CreateDeployTokenDialog from './create-deploy-token-dialog.svelte';
	import DeleteDeployTokenDialog from './delete-deploy-token-dialog.svelte';
	import DeploymentsCard from './deployments-card.svelte';
	import EnvironmentCard from './environment-card.svelte';
	import { getDeployTokens } from './environments.remote';
	import LinkedInstanceCard from './linked-instance-card.svelte';

	const tokens = $derived(await getDeployTokens());

	const dialogs = Dialog.getDialogs();

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head>
	<title>Environments · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Environments</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Environments</Page.Title>
				<Page.Description>
					Build the schema on a development instance and publish it to production: collections,
					functions, plugins and settings. Records, users and secrets stay where they are.
				</Page.Description>
			</div>
		</Page.Header>

		<EnvironmentCard />

		<LinkedInstanceCard />

		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-4">
					<div class="flex flex-col gap-1.5">
						<Card.Title>Deploy tokens</Card.Title>
						<Card.Description>
							Other instances use a deploy token to read this instance's schema and publish to it.
							Create one on production and enter it on your development instance.
						</Card.Description>
					</div>

					<Button.Root
						variant="secondary"
						onclick={() => void dialogs.open(CreateDeployTokenDialog)}
					>
						<Icon.Root icon="lucide:plus" />
						New token
					</Button.Root>
				</div>
			</Card.Header>

			<Card.Content>
				{#if tokens.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Name</Table.Head>
								<Table.Head>Created</Table.Head>
								<Table.Head>Last used</Table.Head>
								<Table.Head><span class="sr-only">Actions</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each tokens as token (token.id)}
								<Table.Row>
									<Table.Cell class="font-medium text-zinc-900">{token.name}</Table.Cell>
									<Table.Cell class="whitespace-nowrap">
										{dateFormat.format(token.createdAt)}
									</Table.Cell>
									<Table.Cell class="whitespace-nowrap">
										{token.lastUsedAt ? dateFormat.format(token.lastUsedAt) : 'Never'}
									</Table.Cell>
									<Table.Cell class="w-0 text-right">
										<DropdownMenu.Root>
											<DropdownMenu.Trigger variant="ghost" size="icon" aria-label="Token actions">
												<Icon.Root icon="lucide:ellipsis" />
											</DropdownMenu.Trigger>

											<DropdownMenu.Content>
												<DropdownMenu.Item
													variant="danger"
													onSelect={() => void dialogs.open(DeleteDeployTokenDialog, { token })}
												>
													<Icon.Root icon="lucide:trash-2" />
													Delete
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="py-8">
						<Empty.Title>No deploy tokens</Empty.Title>
						<Empty.Description>No other instance can publish to this one.</Empty.Description>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<DeploymentsCard />
	</div>
</Page.Root>
