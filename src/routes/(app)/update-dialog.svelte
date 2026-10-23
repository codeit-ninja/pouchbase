<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as CopyButton from '#lib/components/ui/copy-button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Link from '#lib/components/ui/link/index.js';
	import * as Progress from '#lib/components/ui/progress/index.js';
	import { checkForUpdates, getUpdateStatus, updateBinary } from '#lib/remote/updates.remote.js';
	import { updateWorker, waitForVersion, type UpdateProgress } from './worker-update';

	let { close }: DialogProps = $props();

	const status = $derived(await getUpdateStatus());

	let progress = $state<UpdateProgress | null>(null);
	let failure = $state<string | null>(null);

	const steps: Record<UpdateProgress['step'], string> = {
		download: 'Downloading the release…',
		upload: 'Uploading the files to Cloudflare…',
		deploy: 'Deploying the new version…',
		restart: 'Waiting for the new version to start…'
	};

	/** What to run on the server, for the runtimes that can't update themselves. */
	const commands = $derived(
		status.runtime === 'docker'
			? ['cd /opt/pouchbase && docker compose pull && docker compose up -d']
			: status.runtime === 'node'
				? ['git pull && pnpm install && pnpm build:node', 'node server.mjs']
				: []
	);

	function message(error: unknown) {
		if (error && typeof error === 'object' && 'body' in error) {
			const body = (error as { body?: { message?: string } }).body;

			if (body?.message) {
				return body.message;
			}
		}

		return error instanceof Error ? error.message : 'The update failed';
	}

	async function update() {
		failure = null;

		try {
			if (status.runtime === 'workers') {
				await updateWorker((next) => (progress = next));
			} else {
				const { version } = await updateBinary();

				progress = { step: 'restart' };
				await waitForVersion(version);
			}

			close();
			location.reload();
		} catch (error) {
			failure = message(error);
			progress = null;
		}
	}
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>
			{status.available && status.latest
				? `Update to Pouchbase ${status.latest.version}`
				: 'Pouchbase is up to date'}
		</Dialog.Title>
		<Dialog.Description>
			This instance runs version {status.current}.
			{#if status.latest}
				<Link.Root href={status.latest.url} target="_blank" rel="noreferrer">
					{status.available ? 'Release notes' : 'Latest release'}
				</Link.Root>
			{:else}
				GitHub could not be reached to look up the latest release.
			{/if}
		</Dialog.Description>
	</Dialog.Header>

	<div class="flex flex-col gap-4 text-sm text-zinc-600">
		{#if !status.available}
			<p>
				{status.checkedAt
					? `Last checked ${new Date(status.checkedAt).toLocaleString()}.`
					: 'Not checked yet.'}
			</p>
		{:else if status.runtime === 'workers'}
			<p>
				Pouchbase deploys the new version to its own Worker. Requests keep being answered while it
				updates.
			</p>
		{:else if status.runtime === 'binary'}
			<p>
				Pouchbase downloads the new binary, replaces this one and restarts. Requests fail for a few
				seconds while it restarts.
			</p>
		{:else if status.runtime === 'dev'}
			<p>This is the development server: pull the new version of the repository instead.</p>
		{:else}
			<p>
				{status.runtime === 'docker'
					? 'Pull the new image and restart the container on the server:'
					: 'Pull the new version, build it and restart the server:'}
			</p>

			{#each commands as command (command)}
				<div class="flex gap-2">
					<Input.Root value={command} readonly aria-label="Command" class="font-mono" />
					<CopyButton.Root value={command} label="Copy command" />
				</div>
			{/each}

			{#if status.runtime === 'docker'}
				<p>Installed with the install script? Running it again updates as well.</p>
			{/if}
		{/if}

		{#if progress}
			<div class="flex flex-col gap-2">
				<p>{steps[progress.step]}</p>

				{#if progress.step === 'upload' && progress.total}
					<Progress.Root
						value={progress.done ?? 0}
						max={progress.total}
						aria-label="Uploaded"
						aria-valuetext="{progress.done ?? 0} of {progress.total} parts"
					/>
				{/if}
			</div>
		{/if}

		{#if failure}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-x" /></Callout.Icon>
				<Callout.Body>
					<Callout.Title>The update failed</Callout.Title>
					<Callout.Description>{failure}</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}
	</div>

	<Dialog.Footer>
		<Dialog.Close>Close</Dialog.Close>

		{#if !status.available}
			<Button.Root variant="secondary" onclick={() => checkForUpdates()}>Check now</Button.Root>
		{:else if status.runtime === 'workers' || status.runtime === 'binary'}
			<Button.Root onclick={update}>
				<Icon.Root icon="lucide:circle-arrow-up" />
				Update now
			</Button.Root>
		{/if}
	</Dialog.Footer>
</Dialog.Content>
