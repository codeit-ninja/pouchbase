<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { currentUser } from '../../(auth)/auth.remote';
	import { getAdmins } from './admins.remote';
	import CreateAdminDialog from './create-admin-dialog.svelte';

	const [admins, user] = $derived(await Promise.all([getAdmins(), currentUser()]));

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

	const dialogs = Dialog.getDialogs();
</script>

<svelte:head>
	<title>Admins</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Admins</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Admins</Page.Title>
				<Page.Description>
					Accounts that can log in to Pouchbase. Users of your app live in the
					<span class="font-mono">users</span> collection instead.
				</Page.Description>
			</div>

			<Button.Root onclick={() => void dialogs.open(CreateAdminDialog)}>
				<Icon.Root icon="lucide:plus" />
				New admin
			</Button.Root>
		</Page.Header>

		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Email address</Table.Head>
					<Table.Head>Created</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each admins as admin (admin.id)}
					<Table.Row>
						<Table.Cell class="font-medium text-zinc-900">
							<span class="flex items-center gap-2">
								{admin.email}
								{#if admin.id === user?.id}
									<Badge.Root variant="outline">You</Badge.Root>
								{/if}
							</span>
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap">{dateFormat.format(admin.createdAt)}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Page.Root>
