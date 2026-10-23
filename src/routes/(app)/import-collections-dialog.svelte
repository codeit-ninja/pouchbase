<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Checkbox from '#lib/components/ui/inputs/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as File from '#lib/components/ui/inputs/file/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import type { Plan } from '#lib/environments/diff.js';
	import { planSeverity } from '#lib/environments/diff.js';
	import { describeStep, describeWarning } from '#lib/environments/describe.js';
	import { collectionExportSchema } from '#lib/schemas/collections.js';
	import type { CollectionExport } from '#lib/schemas/collections.js';
	import { importCollections } from './collections.remote';
	import SeverityBadge from './severity-badge.svelte';

	let { close }: DialogProps = $props();

	const id = $props.id();

	let files = $state<FileList | undefined>();
	let file = $state<CollectionExport | null>(null);
	let plan = $state<Plan | null>(null);
	let removeMissing = $state(false);
	let confirmed = $state(false);
	let applied = $state(false);
	let failure = $state<string | null>(null);

	const destructive = $derived(!!plan && planSeverity(plan) === 'destructive');

	function errorMessage(error: unknown): string {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		return typeof body?.message === 'string' ? body.message : 'Something went wrong';
	}

	async function read(list: FileList | null) {
		file = null;
		plan = null;
		failure = null;

		const chosen = list?.[0];

		if (!chosen) {
			return;
		}

		try {
			const parsed = collectionExportSchema.safeParse(JSON.parse(await chosen.text()));

			if (!parsed.success) {
				failure = 'This is not an export file of collections';

				return;
			}

			file = parsed.data;
		} catch {
			failure = 'The file is not valid JSON';

			return;
		}

		await preview();
	}

	async function preview() {
		if (!file) {
			return;
		}

		plan = null;
		confirmed = false;
		failure = null;

		try {
			({ plan } = await importCollections({ file, removeMissing, force: false, dryRun: true }));
		} catch (error) {
			failure = errorMessage(error);
		}
	}

	async function run() {
		if (!file) {
			return;
		}

		failure = null;

		try {
			const result = await importCollections({
				file,
				removeMissing,
				force: confirmed,
				dryRun: false
			});

			plan = result.plan;
			applied = true;
		} catch (error) {
			failure = errorMessage(error);
		}
	}
</script>

<Dialog.Content size="lg">
	<Dialog.Header>
		<Dialog.Title>Import collections</Dialog.Title>
		<Dialog.Description>
			Creates the collections of an export file and changes existing collections with the same name
			to match it. Records are left alone.
		</Dialog.Description>
	</Dialog.Header>

	<div class="flex flex-col gap-4">
		{#if !applied}
			<File.Root
				{id}
				bind:files
				accept=".json,application/json"
				aria-label="Export file"
				onchange={(event) => void read(event.currentTarget.files)}
			/>

			<label for="{id}-remove" class="flex items-start gap-2 text-sm text-zinc-700">
				<Checkbox.Root
					id="{id}-remove"
					checked={removeMissing}
					class="mt-0.5"
					onchange={(event) => {
						removeMissing = event.currentTarget.checked;
						void preview();
					}}
				/>
				Also delete the collections that are not in the file, with their records. Built-in collections
				stay.
			</label>
		{/if}

		{#if failure}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>{failure}</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}

		{#if applied && plan}
			<Callout.Root variant="success">
				<Callout.Icon><Icon.Root icon="lucide:circle-check" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>
						Imported: {plan.steps.length}
						{plan.steps.length === 1 ? 'change' : 'changes'} made.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{:else if plan}
			{#if plan.steps.length}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Change</Table.Head>
							<Table.Head><span class="sr-only">Impact</span></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each plan.steps as step, index (index)}
							<Table.Row>
								<Table.Cell class="text-zinc-900">{describeStep(step)}</Table.Cell>
								<Table.Cell class="w-0 text-right">
									<SeverityBadge severity={step.severity} />
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{:else}
				<Empty.Root class="py-8">
					<Empty.Icon><Icon.Root icon="lucide:check" /></Empty.Icon>
					<Empty.Title>Nothing to import</Empty.Title>
					<Empty.Description>The collections already match the file.</Empty.Description>
				</Empty.Root>
			{/if}

			{#if plan.warnings.length}
				<Callout.Root variant="warning">
					<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
					<Callout.Body>
						<Callout.Description>
							<ul class="flex list-disc flex-col gap-1 pl-4">
								{#each plan.warnings as warning, index (index)}
									<li>{describeWarning(warning)}</li>
								{/each}
							</ul>
						</Callout.Description>
					</Callout.Body>
				</Callout.Root>
			{/if}

			{#if destructive}
				<label for="{id}-confirm" class="flex items-start gap-2 text-sm text-zinc-700">
					<Checkbox.Root id="{id}-confirm" bind:checked={confirmed} class="mt-0.5" />
					I understand that the changes marked "Removes data" delete collections, fields or records.
				</label>
			{/if}
		{/if}
	</div>

	<Dialog.Footer>
		{#if applied}
			<Button.Root onclick={() => close()}>Done</Button.Root>
		{:else}
			<Dialog.Close>Cancel</Dialog.Close>
			<Button.Root
				variant={destructive ? 'danger' : 'primary'}
				disabled={!plan?.steps.length || (destructive && !confirmed)}
				onclick={run}
			>
				Import
			</Button.Root>
		{/if}
	</Dialog.Footer>
</Dialog.Content>
