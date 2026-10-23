<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as FileInput from '#lib/components/ui/inputs/file/index.js';
	import * as Select from '#lib/components/ui/inputs/select/index.js';
	import * as Progress from '#lib/components/ui/progress/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import { DATABASE_FILES, readArchive, UPLOAD_PART_SIZE } from '#lib/backups/archive.js';
	import { formatFileSize } from '#lib/files/files.js';
	import { cancelBackupUpload, finishBackupUpload, startBackupUpload } from './backups.remote';
	import type { Destination } from './types';

	type Props = { destinations: Destination[] } & DialogProps<boolean>;

	let { destinations, close }: Props = $props();

	const id = $props.id();

	let destinationId = $state(untrack(() => destinations[0]?.id ?? ''));
	let files = $state<FileList>();
	let uploaded = $state(0);
	let total = $state(0);
	let uploading = $state(false);
	let failure = $state<string | null>(null);

	// Closing the dialog stops the upload after the current part.
	let stopped = false;

	$effect(() => () => {
		stopped = true;
	});

	const items = $derived(
		destinations.map((destination) => ({
			value: destination.id,
			label: destination.name,
			description: destination.bucket
		}))
	);

	function message(error: unknown) {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		if (typeof body?.message === 'string') {
			return body.message;
		}

		return error instanceof Error ? error.message : 'Something went wrong';
	}

	async function sendPart(backupId: string, name: string, part: number, last: boolean, body: Blob) {
		const query = new URLSearchParams({ file: name, part: String(part), last: last ? '1' : '0' });
		const response = await fetch(
			`${resolve('/(app)/backups/[id]/upload', { id: backupId })}?${query}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json' },
				body
			}
		);

		if (!response.ok) {
			const result = (await response.json().catch(() => null)) as { message?: string } | null;
			throw new Error(result?.message ?? `Uploading failed (${response.status})`);
		}
	}

	async function upload() {
		const file = files?.[0];

		if (!file) {
			failure = 'Choose a backup file';
			return;
		}

		failure = null;
		uploading = true;
		uploaded = 0;

		let backupId: string | null = null;

		try {
			const entries = await readArchive(file);
			const manifestEntry = entries.find((entry) => entry.name === 'manifest.json');
			const parts = DATABASE_FILES.map((name) => ({
				name,
				entry: entries.find((entry) => entry.name === name)
			}));

			if (!manifestEntry || parts.some(({ entry }) => !entry)) {
				throw new Error(
					'This file is not a Pouchbase backup: it needs manifest.json, system.sql and app.sql'
				);
			}

			let manifest: unknown;

			try {
				manifest = JSON.parse(
					await file.slice(manifestEntry.offset, manifestEntry.offset + manifestEntry.size).text()
				);
			} catch {
				throw new Error('The manifest.json of this backup is invalid');
			}

			total = parts.reduce((sum, { entry }) => sum + (entry?.size ?? 0), 0);
			backupId = (await startBackupUpload({ destinationId, manifest })).id;

			for (const { name, entry } of parts) {
				if (!entry) {
					continue;
				}

				const count = Math.max(1, Math.ceil(entry.size / UPLOAD_PART_SIZE));

				for (let part = 1; part <= count; part++) {
					if (stopped) {
						throw new Error('The upload was cancelled');
					}

					const start = entry.offset + (part - 1) * UPLOAD_PART_SIZE;
					const end = Math.min(entry.offset + entry.size, start + UPLOAD_PART_SIZE);

					await sendPart(backupId, name, part, part === count, file.slice(start, end));
					uploaded += end - start;
				}
			}

			await finishBackupUpload(backupId);

			toast.success('Backup uploaded; you can restore it from the list');
			close(true);
		} catch (error) {
			failure = message(error);

			if (backupId) {
				await cancelBackupUpload(backupId).catch(() => undefined);
			}
		} finally {
			uploading = false;
		}
	}
</script>

<Dialog.Content size="md">
	<Dialog.Header>
		<Dialog.Title>Upload backup</Dialog.Title>
		<Dialog.Description>
			Adds a downloaded backup (a <span class="font-mono">.tar</span> file) to a destination, so you can
			restore it, also into another installation. Archives don't contain uploaded files.
		</Dialog.Description>
	</Dialog.Header>

	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<span id="{id}-destination-label" class="text-sm font-medium text-zinc-900">Destination</span>
			<Select.Root
				{items}
				bind:value={destinationId}
				id="{id}-destination"
				aria-labelledby="{id}-destination-label"
				disabled={uploading}
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="{id}-file" class="text-sm font-medium text-zinc-900">Backup file</label>
			<FileInput.Root
				id="{id}-file"
				bind:files
				accept=".tar,application/x-tar"
				hint="A .tar file downloaded from the Backups page"
				disabled={uploading}
			/>
		</div>

		{#if uploading && total > 0}
			<div class="flex flex-col gap-2">
				<Progress.Root
					value={uploaded}
					max={total}
					aria-label="Uploaded"
					aria-valuetext="{formatFileSize(uploaded)} of {formatFileSize(total)}"
				/>
				<span class="text-sm text-zinc-500 tabular-nums">
					{formatFileSize(uploaded)} of {formatFileSize(total)} uploaded
				</span>
			</div>
		{/if}

		{#if failure}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>{failure}</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}
	</div>

	<Dialog.Footer>
		<Dialog.Close>Cancel</Dialog.Close>
		<Button.Root onclick={upload} disabled={!files?.length || !destinationId}>
			<Icon.Root icon="lucide:upload" />
			Upload
		</Button.Root>
	</Dialog.Footer>
</Dialog.Content>
