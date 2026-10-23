<script lang="ts">
	import type { PluginSummary } from '@pouchbasejs/plugin-sdk';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Link from '#lib/components/ui/link/index.js';
	import * as Skeleton from '#lib/components/ui/skeleton/index.js';
	import { getPluginDetails, installPlugin } from './plugins.remote';

	type Props = {
		plugin: PluginSummary;
		/** Version that is installed now, when this is an update. */
		installedVersion?: string;
	} & DialogProps;

	let { plugin, installedVersion, close }: Props = $props();

	const form = $derived(installPlugin.for(plugin.id));
	const action = $derived(installedVersion ? 'Update' : 'Install');
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>{action} {plugin.name}</Dialog.Title>
		<Dialog.Description>{plugin.description}</Dialog.Description>
	</Dialog.Header>

	<svelte:boundary>
		{@const details = await getPluginDetails(plugin.id)}
		{@const latest =
			details.versions.find((version) => version.version === details.version) ??
			details.versions[0]}
		{@const hosts = latest?.permissions.network ?? []}

		<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
			<dt class="text-zinc-500">Version</dt>
			<dd class="font-mono text-zinc-900">
				{#if installedVersion}
					{installedVersion} → {details.version}
				{:else}
					{details.version}
				{/if}
			</dd>

			{#if details.author}
				<dt class="text-zinc-500">Author</dt>
				<dd class="text-zinc-900">{details.author}</dd>
			{/if}

			<dt class="text-zinc-500">License</dt>
			<dd class="text-zinc-900">{details.license}</dd>

			{#if details.homepage ?? details.repository}
				<dt class="text-zinc-500">Website</dt>
				<dd class="truncate">
					<Link.Root
						href={(details.homepage ?? details.repository)!}
						target="_blank"
						rel="noreferrer"
					>
						{details.homepage ?? details.repository}
					</Link.Root>
				</dd>
			{/if}
		</dl>

		<div class="flex flex-col gap-2">
			<h3 class="text-sm font-medium text-zinc-900">Permissions</h3>
			{#if hosts.length}
				<p class="text-sm text-zinc-600">The plugin's server code can connect to:</p>
				<ul class="flex flex-col gap-1">
					{#each hosts as host (host)}
						<li class="flex items-center gap-2 font-mono text-sm text-zinc-900">
							<Icon.Root icon="lucide:globe" class="size-4 text-zinc-500" />
							{host}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-zinc-600">
					No network access. The plugin runs in a sandbox and only sees the data Pouchbase passes to
					it.
				</p>
			{/if}
		</div>

		{#if !details.verified}
			<Callout.Root variant="warning">
				<Icon.Root icon="lucide:triangle-alert" class="size-4 shrink-0" />
				<p>
					This plugin has not been reviewed by the Pouchbase team. Only install plugins from authors
					you trust.
				</p>
			</Callout.Root>
		{/if}

		{#snippet pending()}
			<div class="flex flex-col gap-2">
				<Skeleton.Root class="h-4 w-1/2" />
				<Skeleton.Root class="h-4 w-2/3" />
				<Skeleton.Root class="h-4 w-1/3" />
			</div>
		{/snippet}

		{#snippet failed(error)}
			<Callout.Root variant="error">
				<Icon.Root icon="lucide:circle-alert" class="size-4 shrink-0" />
				<p>{(error as Error).message ?? 'The plugin could not be loaded'}</p>
			</Callout.Root>
		{/snippet}
	</svelte:boundary>

	<Form.Root
		{form}
		success={`${plugin.name} ${installedVersion ? 'updated' : 'installed'}`}
		enhance={async (instance) => {
			if (await instance.submit()) {
				close();
			}
		}}
	>
		<Form.Hidden field={form.fields.id} value={plugin.id} />

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Form.Submit>{action}</Form.Submit>
		</Dialog.Footer>
	</Form.Root>
</Dialog.Content>
