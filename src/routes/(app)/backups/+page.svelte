<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { describeCron } from '#lib/backups/cron.js';
	import { formatFileSize } from '#lib/files/files.js';
	import BackupStatusBadge from './backup-status-badge.svelte';
	import { advanceBackups, discoverBackups, getBackups } from './backups.remote';
	import CreateBackupDialog from './create-backup-dialog.svelte';
	import DeleteBackupDialog from './delete-backup-dialog.svelte';
	import DeleteDestinationDialog from './delete-destination-dialog.svelte';
	import DeleteScheduleDialog from './delete-schedule-dialog.svelte';
	import DestinationDialog from './destination-dialog.svelte';
	import RestoreBackupDialog from './restore-backup-dialog.svelte';
	import RestoreStatus from './restore-status.svelte';
	import ScheduleDialog from './schedule-dialog.svelte';
	import UploadBackupDialog from './upload-backup-dialog.svelte';
	import type { Backup, Destination } from './types';

	const overview = $derived(await getBackups());

	const dialogs = Dialog.getDialogs();

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
	const format = (date: Date) => dateFormat.format(date);

	const restoring = $derived(overview.restore?.status === 'running');
	const active = $derived(
		restoring || overview.backups.some((backup) => backup.status === 'running')
	);

	let failure = $state<string | null>(null);
	let advancing = false;

	// Leaving the page stops driving the jobs; scheduled ticks continue them.
	let stopped = false;

	$effect(() => () => {
		stopped = true;
	});

	$effect(() => {
		if (active && !advancing) {
			untrack(() => void advance());
		}
	});

	function errorMessage(error: unknown): string {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		return typeof body?.message === 'string' ? body.message : 'Something went wrong';
	}

	/** Runs steps of the running jobs from this page, so they finish without waiting for ticks. */
	async function advance() {
		advancing = true;
		failure = null;

		const wasRestoring = restoring;

		try {
			while (!stopped) {
				const { running } = await advanceBackups();

				await getBackups().refresh();

				if (!running) {
					break;
				}
			}
		} catch (error) {
			failure = errorMessage(error);
		} finally {
			advancing = false;
		}

		// The databases changed under the page: load everything again.
		if (wasRestoring && !stopped && overview.restore?.status === 'completed') {
			window.location.reload();
		}
	}

	function host(endpoint: string) {
		return URL.canParse(endpoint) ? new URL(endpoint).host : endpoint;
	}

	async function discover(destination: Destination) {
		try {
			const { added } = await discoverBackups(destination.id);

			toast.success(
				added === 0
					? `No new backups in ${destination.name}`
					: `Added ${added === 1 ? '1 backup' : `${added} backups`} from ${destination.name}`
			);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	function details(backup: Backup) {
		const parts = [backup.size ? formatFileSize(backup.size) : null];

		if (backup.includeFiles) {
			parts.push(backup.files === 1 ? '1 new file' : `${backup.files} new files`);
		}

		return parts.filter(Boolean).join(' · ') || '—';
	}
</script>

<svelte:head>
	<title>Backups · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Backups</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Backups</Page.Title>
				<Page.Description>
					Copies of the databases, and optionally the uploaded files, in S3-compatible storage.
				</Page.Description>
			</div>

			<div class="flex flex-wrap gap-2">
				<Button.Root
					variant="secondary"
					disabled={!overview.destinations.length}
					onclick={() =>
						void dialogs.open(UploadBackupDialog, { destinations: overview.destinations })}
				>
					<Icon.Root icon="lucide:upload" />
					Upload backup
				</Button.Root>

				<Button.Root
					disabled={!overview.destinations.length || restoring}
					onclick={() =>
						void dialogs.open(CreateBackupDialog, { destinations: overview.destinations })}
				>
					<Icon.Root icon="lucide:database-backup" />
					Back up now
				</Button.Root>
			</div>
		</Page.Header>

		{#if overview.restore}
			<RestoreStatus restore={overview.restore} {format} />
		{/if}

		{#if failure}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>
						{failure}. Running backups continue in the background.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}

		{#if !overview.destinations.length}
			<Empty.Root>
				<Empty.Icon><Icon.Root icon="lucide:database-backup" /></Empty.Icon>
				<Empty.Title>No destination yet</Empty.Title>
				<Empty.Description>
					Add an S3-compatible bucket, such as Amazon S3, Cloudflare R2 or Backblaze B2, to store
					backups in.
				</Empty.Description>
				<Button.Root onclick={() => void dialogs.open(DestinationDialog, {})}>
					<Icon.Root icon="lucide:plus" />
					Add destination
				</Button.Root>
			</Empty.Root>
		{:else}
			<section class="flex flex-col gap-3" aria-labelledby="backups-history">
				<h2 id="backups-history" class="text-base font-semibold text-zinc-900">History</h2>

				{#if overview.backups.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Made</Table.Head>
								<Table.Head>Destination</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Size</Table.Head>
								<Table.Head><span class="sr-only">Actions</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each overview.backups as backup (backup.id)}
								<Table.Row>
									<Table.Cell class="font-medium whitespace-nowrap text-zinc-900">
										<span class="flex items-center gap-2">
											{format(backup.startedAt)}
											<Badge.Root variant="outline">
												{backup.scheduled ? 'Scheduled' : 'Manual'}
											</Badge.Root>
										</span>
									</Table.Cell>
									<Table.Cell>{backup.destinationName}</Table.Cell>
									<Table.Cell>
										<BackupStatusBadge
											status={backup.status}
											step={backup.step}
											error={backup.error}
										/>
									</Table.Cell>
									<Table.Cell class="whitespace-nowrap tabular-nums">{details(backup)}</Table.Cell>
									<Table.Cell class="w-0 text-right">
										<DropdownMenu.Root>
											<DropdownMenu.Trigger
												variant="ghost"
												size="icon"
												aria-label="Backup actions"
												disabled={backup.status === 'running'}
											>
												<Icon.Root icon="lucide:ellipsis" />
											</DropdownMenu.Trigger>

											<DropdownMenu.Content>
												<DropdownMenu.Item
													disabled={backup.status !== 'completed' || active}
													onSelect={() =>
														void dialogs.open(RestoreBackupDialog, {
															backup,
															label: format(backup.startedAt)
														})}
												>
													<Icon.Root icon="lucide:archive-restore" />
													Restore
												</DropdownMenu.Item>

												<!-- The archive is sent as an attachment, so the page stays open. -->
												<DropdownMenu.Item
													disabled={backup.status !== 'completed'}
													onSelect={() =>
														window.location.assign(
															resolve('/(app)/backups/[id]/download', { id: backup.id })
														)}
												>
													<Icon.Root icon="lucide:download" />
													Download
												</DropdownMenu.Item>

												<DropdownMenu.Separator />

												<DropdownMenu.Item
													variant="danger"
													onSelect={() =>
														void dialogs.open(DeleteBackupDialog, {
															backup,
															label: format(backup.startedAt)
														})}
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
						<Empty.Title>No backups yet</Empty.Title>
						<Empty.Description>
							Back up now, or add a schedule to make backups automatically.
						</Empty.Description>
					</Empty.Root>
				{/if}
			</section>

			<Card.Root>
				<Card.Header>
					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col gap-1.5">
							<Card.Title>Schedules</Card.Title>
							<Card.Description>
								Backups made automatically. They run on the Worker's Cron Trigger or the Node
								server's timer, also when nobody is logged in.
							</Card.Description>
						</div>

						<Button.Root
							variant="secondary"
							onclick={() =>
								void dialogs.open(ScheduleDialog, { destinations: overview.destinations })}
						>
							<Icon.Root icon="lucide:plus" />
							New schedule
						</Button.Root>
					</div>
				</Card.Header>

				{#if overview.schedules.length}
					<Card.Content>
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>When</Table.Head>
									<Table.Head>Destination</Table.Head>
									<Table.Head>Keeps</Table.Head>
									<Table.Head>Next backup</Table.Head>
									<Table.Head><span class="sr-only">Actions</span></Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each overview.schedules as schedule (schedule.id)}
									<Table.Row>
										<Table.Cell class="font-medium text-zinc-900">
											<span class="flex flex-wrap items-center gap-2">
												{describeCron(schedule.cron)}
												{#if schedule.includeFiles}
													<Badge.Root variant="outline">With files</Badge.Root>
												{/if}
											</span>
										</Table.Cell>
										<Table.Cell>{schedule.destinationName}</Table.Cell>
										<Table.Cell class="tabular-nums">
											{schedule.keep === 0 ? 'All' : schedule.keep}
										</Table.Cell>
										<Table.Cell class="whitespace-nowrap">
											{#if schedule.enabled}
												{format(schedule.nextRunAt)}
											{:else}
												<Badge.Root>Paused</Badge.Root>
											{/if}
										</Table.Cell>
										<Table.Cell class="w-0 text-right">
											<DropdownMenu.Root>
												<DropdownMenu.Trigger
													variant="ghost"
													size="icon"
													aria-label="Schedule actions"
												>
													<Icon.Root icon="lucide:ellipsis" />
												</DropdownMenu.Trigger>

												<DropdownMenu.Content>
													<DropdownMenu.Item
														onSelect={() =>
															void dialogs.open(ScheduleDialog, {
																destinations: overview.destinations,
																schedule
															})}
													>
														<Icon.Root icon="lucide:pencil" />
														Edit
													</DropdownMenu.Item>

													<DropdownMenu.Separator />

													<DropdownMenu.Item
														variant="danger"
														onSelect={() => void dialogs.open(DeleteScheduleDialog, { schedule })}
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
					</Card.Content>
				{:else}
					<Card.Content>
						<Empty.Root class="py-8">
							<Empty.Description>No schedules yet.</Empty.Description>
						</Empty.Root>
					</Card.Content>
				{/if}
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col gap-1.5">
							<Card.Title>Destinations</Card.Title>
							<Card.Description>The buckets backups are stored in.</Card.Description>
						</div>

						<Button.Root
							variant="secondary"
							onclick={() => void dialogs.open(DestinationDialog, {})}
						>
							<Icon.Root icon="lucide:plus" />
							Add destination
						</Button.Root>
					</div>
				</Card.Header>

				<Card.Content>
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Name</Table.Head>
								<Table.Head>Bucket</Table.Head>
								<Table.Head>Folder</Table.Head>
								<Table.Head><span class="sr-only">Actions</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each overview.destinations as destination (destination.id)}
								<Table.Row>
									<Table.Cell class="font-medium text-zinc-900">{destination.name}</Table.Cell>
									<Table.Cell>{destination.bucket} on {host(destination.endpoint)}</Table.Cell>
									<Table.Cell class="font-mono text-xs">{destination.prefix}/</Table.Cell>
									<Table.Cell class="w-0 text-right">
										<DropdownMenu.Root>
											<DropdownMenu.Trigger
												variant="ghost"
												size="icon"
												aria-label="Destination actions"
											>
												<Icon.Root icon="lucide:ellipsis" />
											</DropdownMenu.Trigger>

											<DropdownMenu.Content>
												<DropdownMenu.Item
													onSelect={() => void dialogs.open(DestinationDialog, { destination })}
												>
													<Icon.Root icon="lucide:pencil" />
													Edit
												</DropdownMenu.Item>

												<DropdownMenu.Item onSelect={() => void discover(destination)}>
													<Icon.Root icon="lucide:search" />
													Find backups
												</DropdownMenu.Item>

												<DropdownMenu.Separator />

												<DropdownMenu.Item
													variant="danger"
													disabled={active}
													onSelect={() =>
														void dialogs.open(DeleteDestinationDialog, { destination })}
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
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</Page.Root>
