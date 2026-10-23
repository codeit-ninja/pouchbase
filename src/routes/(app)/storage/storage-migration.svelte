<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Progress from '#lib/components/ui/progress/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import SkipMigrationDialog from './skip-migration-dialog.svelte';
	import { getStorageMigration, migrateStorage } from './storage.remote';

	const migration = $derived(await getStorageMigration());

	const dialogs = Dialog.getDialogs();

	/** Progress of the running migration; the query's numbers otherwise. */
	let progress = $state<{ done: number; total: number } | null>(null);
	let failure = $state<string | null>(null);
	let running = $state(false);

	// Leaving the page stops the migration after the current step; it continues from there.
	let stopped = false;

	$effect(() => () => {
		stopped = true;
	});

	const done = $derived(progress?.done ?? migration?.done ?? 0);
	const total = $derived(progress?.total ?? migration?.total ?? 0);

	const source = $derived.by(() => {
		if (!migration) {
			return '';
		}

		if (migration.source.provider === 'r2') {
			return 'Cloudflare R2';
		}

		return `${migration.source.bucket} on ${URL.canParse(migration.source.endpoint) ? new URL(migration.source.endpoint).host : migration.source.endpoint}`;
	});

	function errorMessage(error: unknown): string {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		return typeof body?.message === 'string' ? body.message : 'Something went wrong';
	}

	async function migrate() {
		failure = null;
		running = true;

		try {
			while (!stopped) {
				const step = await migrateStorage();

				progress = step;

				if (step.finished) {
					toast.success('All files moved');
					break;
				}
			}
		} catch (error) {
			failure = errorMessage(error);
		} finally {
			await getStorageMigration().refresh();
			progress = null;
			running = false;
		}
	}
</script>

{#if migration}
	<Card.Root>
		<Card.Header>
			<Card.Title>Move files</Card.Title>
			<Card.Description>
				Files uploaded before the switch are still in {source}. Until they are moved, they are read
				from there. They are copied, so the originals stay where they are.
			</Card.Description>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Progress.Root
					value={done}
					max={total}
					aria-label="Files moved"
					aria-valuetext="{done} of {total} files"
				/>
				<span class="text-sm text-zinc-500 tabular-nums">{done} of {total} files moved</span>
			</div>

			{#if failure}
				<Callout.Root variant="error">
					<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
					<Callout.Body>
						<Callout.Description>{failure}</Callout.Description>
					</Callout.Body>
				</Callout.Root>
			{/if}

			<div class="flex justify-end gap-2">
				<Button.Root
					variant="ghost"
					disabled={running}
					onclick={() =>
						void dialogs.open(SkipMigrationDialog, { source, remaining: total - done })}
				>
					Skip
				</Button.Root>

				<Button.Root onclick={migrate}>
					<Icon.Root icon="lucide:arrow-right-left" />
					{failure ? 'Try again' : done > 0 ? 'Continue moving files' : 'Move files'}
				</Button.Root>
			</div>
		</Card.Content>
	</Card.Root>
{/if}
