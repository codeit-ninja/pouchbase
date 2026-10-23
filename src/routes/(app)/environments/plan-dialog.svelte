<script lang="ts">
	import { onMount } from 'svelte';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Checkbox from '#lib/components/ui/inputs/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Progress from '#lib/components/ui/progress/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import type { PlanStep } from '#lib/environments/diff.js';
	import { planSeverity } from '#lib/environments/diff.js';
	import { describeStep, describeWarning } from '#lib/environments/describe.js';
	import { advanceRemote, planRemote, startRemote } from './environments.remote';
	import SeverityBadge from '../severity-badge.svelte';
	import type { Deployment, Direction, RemotePlan } from './types';

	type Props = { direction: Direction } & DialogProps;

	let { direction, close }: Props = $props();

	let plan = $state<RemotePlan | null>(null);
	let deployment = $state<Deployment | null>(null);
	let failure = $state<string | null>(null);
	let confirmed = $state(false);

	// Closing the dialog stops driving the steps; the scheduled tick continues them.
	let stopped = false;

	const verb = $derived(direction === 'publish' ? 'Publish' : 'Pull');
	const title = $derived(
		direction === 'publish' ? 'Publish to the linked instance' : 'Pull from the linked instance'
	);
	const destructive = $derived(!!plan && planSeverity(plan.plan) === 'destructive');
	const finished = $derived(!!deployment && deployment.status !== 'running');

	onMount(() => {
		void load();

		return () => {
			stopped = true;
		};
	});

	function errorMessage(error: unknown): string {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		return typeof body?.message === 'string' ? body.message : 'Something went wrong';
	}

	async function load() {
		try {
			plan = await planRemote(direction);
		} catch (error) {
			failure = errorMessage(error);
		}
	}

	async function start() {
		if (!plan) {
			return;
		}

		failure = null;

		try {
			let current = await startRemote({
				direction,
				sourceHash: plan.sourceHash,
				targetHash: plan.targetHash,
				confirmDestructive: confirmed
			});

			deployment = current;

			while (!stopped && current.status === 'running') {
				current = await advanceRemote({ direction, id: current.id });
				deployment = current;
			}
		} catch (error) {
			failure = errorMessage(error);
		}
	}
</script>

<Dialog.Content size="lg">
	<Dialog.Header>
		<Dialog.Title>{title}</Dialog.Title>
		<Dialog.Description>
			{#if direction === 'publish'}
				The changes that make the linked instance match this one.
			{:else}
				The changes that make this instance match the linked one.
			{/if}
			Records, users and secrets are left alone.
		</Dialog.Description>
	</Dialog.Header>

	<div class="flex flex-col gap-4">
		{#if failure}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>{failure}</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}

		{#if deployment}
			<div class="flex flex-col gap-2">
				<Progress.Root
					value={deployment.done}
					max={Math.max(deployment.total, 1)}
					aria-label="Progress"
					aria-valuetext="{deployment.done} of {deployment.total} changes"
				/>
				<p class="text-sm text-zinc-600">
					{#if deployment.status === 'completed'}
						All {deployment.total} changes are done.
					{:else if deployment.backingUp}
						Making a backup of the target first…
					{:else if deployment.current}
						{deployment.done} of {deployment.total}: {describeStep(deployment.current as PlanStep)}
					{/if}
				</p>
			</div>

			{#if deployment.status === 'completed'}
				<Callout.Root variant="success">
					<Callout.Icon><Icon.Root icon="lucide:circle-check" /></Callout.Icon>
					<Callout.Body>
						<Callout.Description>
							{direction === 'publish' ? 'Published' : 'Pulled'} without problems.
						</Callout.Description>
					</Callout.Body>
				</Callout.Root>
			{:else if deployment.status === 'failed'}
				<Callout.Root variant="error">
					<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
					<Callout.Body>
						<Callout.Description>
							Stopped after {deployment.done} of {deployment.total} changes: {deployment.error}
							{#if deployment.backupId}
								The backup made before it is on the Backups page of the target.
							{/if}
						</Callout.Description>
					</Callout.Body>
				</Callout.Root>
			{/if}
		{:else if plan}
			{#if plan.plan.steps.length}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Change</Table.Head>
							<Table.Head><span class="sr-only">Impact</span></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each plan.plan.steps as step, index (index)}
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
					<Empty.Title>Nothing to {verb.toLowerCase()}</Empty.Title>
					<Empty.Description>Both instances have the same schema and settings.</Empty.Description>
				</Empty.Root>
			{/if}

			{#if plan.plan.warnings.length}
				<Callout.Root variant="warning">
					<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
					<Callout.Body>
						<Callout.Description>
							<ul class="flex list-disc flex-col gap-1 pl-4">
								{#each plan.plan.warnings as warning, index (index)}
									<li>{describeWarning(warning)}</li>
								{/each}
							</ul>
						</Callout.Description>
					</Callout.Body>
				</Callout.Root>
			{/if}

			{#if destructive}
				<label class="flex items-start gap-2 text-sm text-zinc-700">
					<Checkbox.Root bind:checked={confirmed} class="mt-0.5" />
					I understand that the changes marked "Removes data" delete records, fields or code on
					{direction === 'publish' ? 'the linked instance' : 'this instance'}.
				</label>
			{/if}
		{:else if !failure}
			<div class="flex items-center gap-2 py-8 text-sm text-zinc-600">
				<Spinner.Root class="size-4" />
				Comparing both instances…
			</div>
		{/if}
	</div>

	<Dialog.Footer>
		{#if finished}
			<Button.Root onclick={() => close()}>Done</Button.Root>
		{:else}
			<Dialog.Close>Cancel</Dialog.Close>
			<Button.Root
				variant={destructive ? 'danger' : 'primary'}
				disabled={!plan?.plan.steps.length || (destructive && !confirmed) || !!deployment}
				onclick={start}
			>
				{verb}
			</Button.Root>
		{/if}
	</Dialog.Footer>
</Dialog.Content>
