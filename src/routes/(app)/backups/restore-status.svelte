<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import type { Restore } from './types';

	type Props = { restore: Restore; format: (date: Date) => string };

	let { restore, format }: Props = $props();

	const source = $derived(
		restore.backupStartedAt ? `the backup of ${format(restore.backupStartedAt)}` : 'a backup'
	);
	const files = $derived(restore.files === 1 ? '1 file' : `${restore.files} files`);
</script>

<!-- The latest restore while it runs, and how it ended. -->
{#if restore.status === 'running'}
	<Callout.Root>
		<Callout.Icon><Spinner.Root /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Restoring {source}</Callout.Title>
			<Callout.Description>
				{restore.step}{restore.includeFiles ? ` (${files} so far)` : ''}. Backups wait until the
				restore is done.
				{#if restore.error}
					The last attempt failed and is tried again: {restore.error}
				{/if}
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>
{:else if restore.status === 'failed'}
	<Callout.Root variant="error">
		<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>Restoring {source} failed</Callout.Title>
			<Callout.Description>
				{restore.error} Your data is unchanged, unless only restoring files failed; you can restore again.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>
{:else}
	<Callout.Root variant="success">
		<Callout.Icon><Icon.Root icon="lucide:circle-check" /></Callout.Icon>
		<Callout.Body>
			<Callout.Description>
				Restored {source} on {format(restore.finishedAt ?? restore.startedAt)}{restore.includeFiles
					? `, with ${files}`
					: ''}.
			</Callout.Description>
		</Callout.Body>
	</Callout.Root>
{/if}
