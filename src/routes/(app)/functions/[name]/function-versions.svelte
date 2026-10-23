<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { formatFileSize } from '#lib/files/files.js';
	import { getFunctionVersions } from '../functions.remote';
	import type { FunctionData } from '../types';
	import VersionDialog from './version-dialog.svelte';

	type Props = { fn: FunctionData };

	let { fn }: Props = $props();

	const versions = $derived(await getFunctionVersions(fn.id));

	const dialogs = Dialog.getDialogs();

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Versions</Card.Title>
		<Card.Description>
			Every deploy is kept. Restoring an older version deploys its code again as a new version;
			secrets stay as they are.
		</Card.Description>
	</Card.Header>

	<Card.Content>
		{#if versions.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Version</Table.Head>
						<Table.Head>Deployed</Table.Head>
						<Table.Head>Language</Table.Head>
						<Table.Head>Size</Table.Head>
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each versions as version (version.id)}
						<Table.Row>
							<Table.Cell class="font-medium text-zinc-900 tabular-nums">
								<span class="flex items-center gap-2">
									v{version.number}
									{#if version.number === fn.version}
										<Badge.Root variant="success">Running</Badge.Root>
									{/if}
								</span>
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{dateFormat.format(version.createdAt)}
							</Table.Cell>
							<Table.Cell>
								{version.language === 'typescript' ? 'TypeScript' : 'JavaScript'}
							</Table.Cell>
							<Table.Cell class="tabular-nums">{formatFileSize(version.size)}</Table.Cell>
							<Table.Cell class="w-0 text-right">
								<Button.Root
									variant="ghost"
									onclick={() =>
										void dialogs.open(VersionDialog, {
											fn,
											version,
											running: version.number === fn.version
										})}
								>
									<Icon.Root icon="lucide:eye" />
									View
								</Button.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="py-8">
				<Empty.Description>
					No versions yet. Deploy the code to create the first one.
				</Empty.Description>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
