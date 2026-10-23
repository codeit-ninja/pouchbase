<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Logo from '#lib/components/ui/logo/index.js';
	import * as Navigation from '#lib/components/ui/navigation/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { getEnvironment } from '#lib/remote/settings.remote.js';
	import { currentUser, logout } from '../(auth)/auth.remote';
	import CollectionsNavigation from './collections-navigation.svelte';
	import UpdateStatus from './update-status.svelte';

	const [environment, user] = $derived(await Promise.all([getEnvironment(), currentUser()]));
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<Logo.Root alt="" />
		<span class="truncate leading-tight font-semibold text-zinc-900">Pouchbase</span>
		{#if environment === 'development'}
			<Badge.Root variant="warning" class="ml-auto">Development</Badge.Root>
		{:else if environment === 'production'}
			<Badge.Root variant="danger" class="ml-auto">Production</Badge.Root>
		{/if}
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Navigation.Root aria-label="Main">
				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)')}>
						<Icon.Root icon="lucide:layout-dashboard" />
						Dashboard
					</Navigation.Link>
				</Navigation.Item>
			</Navigation.Root>
		</Sidebar.Group>

		<CollectionsNavigation />

		<Sidebar.Group>
			<Sidebar.GroupHeader class="h-row">
				<Sidebar.GroupLabel>System</Sidebar.GroupLabel>
			</Sidebar.GroupHeader>

			<Navigation.Root aria-label="System">
				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/functions')}>
						<Icon.Root icon="lucide:square-function" />
						Functions
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/mail')}>
						<Icon.Root icon="lucide:mail" />
						Mail
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/storage')}>
						<Icon.Root icon="lucide:hard-drive" />
						Storage
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/backups')}>
						<Icon.Root icon="lucide:database-backup" />
						Backups
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/environments')}>
						<Icon.Root icon="lucide:arrow-left-right" />
						Environments
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/auth')}>
						<Icon.Root icon="lucide:shield-check" />
						Authentication
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/admins')}>
						<Icon.Root icon="lucide:user-cog" />
						Admins
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/api-keys')}>
						<Icon.Root icon="lucide:key-round" />
						API keys
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/types')}>
						<Icon.Root icon="lucide:file-code" />
						Types
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/plugins')}>
						<Icon.Root icon="lucide:puzzle" />
						Plugins
					</Navigation.Link>
				</Navigation.Item>

				<Navigation.Item>
					<Navigation.Link href={resolve('/(app)/settings')}>
						<Icon.Root icon="lucide:settings" />
						Settings
					</Navigation.Link>
				</Navigation.Item>
			</Navigation.Root>
		</Sidebar.Group>
	</Sidebar.Content>

	<!-- Loads on its own, so a slow look-up of the latest release never holds up the page. -->
	<svelte:boundary>
		<UpdateStatus />

		{#snippet pending()}{/snippet}
		{#snippet failed()}{/snippet}
	</svelte:boundary>

	<Sidebar.Footer>
		<span class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">{user?.email}</span>

		<Form.Root form={logout}>
			<Form.Submit variant="ghost" size="icon" aria-label="Log out">
				<Icon.Root icon="lucide:log-out" />
			</Form.Submit>
		</Form.Root>
	</Sidebar.Footer>
</Sidebar.Root>
