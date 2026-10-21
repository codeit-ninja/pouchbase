<script lang="ts">
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Logo from '#lib/components/ui/logo/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { getAppName } from '#lib/remote/settings.remote.js';
	import { currentUser, logout } from '../(auth)/auth.remote';
	import { listCollections } from './collections.remote';
	import CreateCollectionDialog from './create-collection-dialog.svelte';

	const [appName, user, collections] = $derived(
		await Promise.all([getAppName(), currentUser(), listCollections()])
	);

	const dialogs = Dialog.getDialogs();
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<Logo.Root alt="" />
		<div class="flex min-w-0 flex-col">
			<span class="truncate leading-tight font-semibold text-zinc-900">Pouchbase</span>
			<span class="truncate text-xs text-zinc-500">{appName}</span>
		</div>
	</Sidebar.Header>

	<Sidebar.Content aria-label="Main">
		<Sidebar.Group>
			<Sidebar.GroupHeader>
				<Sidebar.GroupLabel>Collections</Sidebar.GroupLabel>

				<Button.Root
					variant="ghost"
					size="icon"
					aria-label="Create collection"
					onclick={() => void dialogs.open(CreateCollectionDialog)}
				>
					<Icon.Root icon="lucide:plus" />
				</Button.Root>
			</Sidebar.GroupHeader>

			{#if collections.length}
				<Sidebar.Menu>
					{#each collections as collection (collection.id)}
						{@const href = resolve('/(app)/collections/[name]', { name: collection.name })}

						<Sidebar.MenuItem>
							<Sidebar.MenuLink {href} active={page.url.pathname === href}>
								{#if collection.system}
									<Icon.Root icon="lucide:users" />
								{:else}
									<Icon.Root icon="lucide:table-2" />
								{/if}
								<span class="truncate">{collection.name}</span>
							</Sidebar.MenuLink>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			{:else}
				<Sidebar.Empty>No collections yet.</Sidebar.Empty>
			{/if}
		</Sidebar.Group>

		<Sidebar.Group>
			<Sidebar.GroupHeader class="h-control">
				<Sidebar.GroupLabel>System</Sidebar.GroupLabel>
			</Sidebar.GroupHeader>

			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuLink
						href={resolve('/(app)/auth')}
						active={page.url.pathname === resolve('/(app)/auth')}
					>
						<Icon.Root icon="lucide:shield-check" />
						Authentication
					</Sidebar.MenuLink>
				</Sidebar.MenuItem>

				<Sidebar.MenuItem>
					<Sidebar.MenuLink
						href={resolve('/(app)/settings')}
						active={page.url.pathname === resolve('/(app)/settings')}
					>
						<Icon.Root icon="lucide:settings" />
						Settings
					</Sidebar.MenuLink>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-sm font-medium text-zinc-900">{user?.username}</span>
			<span class="truncate text-xs text-zinc-500">{user?.email}</span>
		</div>

		<Form.Root form={logout}>
			<Form.Submit variant="ghost" size="icon" aria-label="Log out">
				<Icon.Root icon="lucide:log-out" />
			</Form.Submit>
		</Form.Root>
	</Sidebar.Footer>
</Sidebar.Root>
